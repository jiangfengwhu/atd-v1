import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { getSystemSettings, sendEmailViaResend } from '../services/resend';
import { AppVariables, EmailOtpRecord, Env, UserRecord } from '../types';
import {
  constantTimeEqual,
  extractBearerToken,
  generateOtpCode,
  generateRandomToken,
  getCookieValue,
  sha256Hex,
} from '../utils/crypto';

export const authRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// POST /api/v1/auth/send-code
authRoute.post('/send-code', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_EMAIL', message: 'Invalid JSON request body' },
      400
    );
  }

  const email = normalizeEmail(body?.email);
  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    return c.json(
      { error: '400_INVALID_EMAIL', message: '请输入有效的邮箱地址' },
      400
    );
  }

  try {
    const db = getDb(c);
    const settings = await getSystemSettings(db, c.env);

    if (!settings.resend_api_key) {
      return c.json(
        {
          error: '503_EMAIL_NOT_CONFIGURED',
          message: '邮件服务尚未配置，请联系管理员配置 Resend API Key',
        },
        503
      );
    }

    // Check 60s send cooldown per email
    const latestOtp = await db
      .prepare(
        'SELECT created_at FROM email_otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(email)
      .first<{ created_at: string }>();

    if (latestOtp) {
      const elapsedMs = Date.now() - new Date(latestOtp.created_at).getTime();
      if (elapsedMs < COOLDOWN_SECONDS * 1000) {
        const retryAfter = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
        return c.json(
          {
            error: '429_RATE_LIMITED',
            message: `发送过于频繁，请在 ${retryAfter} 秒后重试`,
            retry_after_seconds: retryAfter,
          },
          429
        );
      }
    }

    const code = generateOtpCode();
    const codeHash = await sha256Hex(`${email}:${code}`);
    const now = new Date();
    const expiryMinutes = settings.otp_expiry_minutes;
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60_000).toISOString();
    const safeSiteName = escapeHtml(settings.site_name);

    const sendResult = await sendEmailViaResend({
      apiKey: settings.resend_api_key,
      from: settings.resend_from_email,
      to: email,
      subject: `[${settings.site_name}] 您的登录验证码：${code}`,
      text: `您的 ${settings.site_name} 登录验证码为：${code}，有效期 ${expiryMinutes} 分钟。如非本人操作请忽略。`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;color:#0f1419;">${safeSiteName} 登录验证</h2>
        <p style="color:#536471;font-size:14px;">请使用以下 6 位验证码完成登录（${expiryMinutes} 分钟内有效）：</p>
        <div style="margin:20px 0;padding:16px;background:#f7f9f9;border-radius:12px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#1d9bf0;">${code}</div>
        <p style="color:#8b98a5;font-size:12px;">如果这不是您本人的请求，请忽略此邮件。</p>
      </div>`,
    });

    if (!sendResult.ok) {
      return c.json(
        {
          error: '502_EMAIL_SEND_FAILED',
          message: sendResult.message || '验证码邮件发送失败，请检查 Resend 配置',
        },
        502
      );
    }

    await db
      .prepare(
        `INSERT INTO email_otp_codes (id, email, code_hash, expires_at, attempts, consumed_at, created_at)
         VALUES (?, ?, ?, ?, 0, NULL, ?)`
      )
      .bind(crypto.randomUUID(), email, codeHash, expiresAt, now.toISOString())
      .run();

    return c.json(
      {
        sent: true,
        expires_in_seconds: expiryMinutes * 60,
        cooldown_seconds: COOLDOWN_SECONDS,
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /auth/send-code:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to process verification code request' },
      500
    );
  }
});

// POST /api/v1/auth/verify-code
authRoute.post('/verify-code', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CODE', message: 'Invalid JSON request body' },
      400
    );
  }

  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!email || !EMAIL_REGEX.test(email) || !/^\d{6}$/.test(code)) {
    return c.json(
      { error: '400_INVALID_CODE', message: '请输入有效的邮箱和 6 位数字验证码' },
      400
    );
  }

  try {
    const db = getDb(c);
    const otp = await db
      .prepare(
        `SELECT id, email, code_hash, expires_at, attempts, consumed_at, created_at
         FROM email_otp_codes
         WHERE email = ? AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(email)
      .first<EmailOtpRecord>();

    if (!otp) {
      return c.json(
        { error: '400_INVALID_CODE', message: '验证码无效，请先获取验证码' },
        400
      );
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      return c.json(
        {
          error: '429_TOO_MANY_ATTEMPTS',
          message: '错误尝试次数过多，请重新获取验证码',
        },
        429
      );
    }

    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      return c.json(
        { error: '410_CODE_EXPIRED', message: '验证码已过期，请重新发送' },
        410
      );
    }

    const expectedHash = await sha256Hex(`${email}:${code}`);
    if (!constantTimeEqual(expectedHash, otp.code_hash)) {
      await db
        .prepare('UPDATE email_otp_codes SET attempts = attempts + 1 WHERE id = ?')
        .bind(otp.id)
        .run();

      return c.json(
        { error: '400_INVALID_CODE', message: '验证码不正确' },
        400
      );
    }

    const nowIso = new Date().toISOString();
    await db
      .prepare('UPDATE email_otp_codes SET consumed_at = ? WHERE id = ?')
      .bind(nowIso, otp.id)
      .run();

    // Find or create user bound to this email
    const existingBinding = await db
      .prepare('SELECT user_id FROM user_auth_emails WHERE email = ?')
      .bind(email)
      .first<{ user_id: string }>();

    let user: UserRecord & { email: string };
    if (existingBinding) {
      const existingUser = await db
        .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
        .bind(existingBinding.user_id)
        .first<UserRecord>();

      if (existingUser) {
        user = { ...existingUser, email };
      } else {
        const defaultName = email.split('@')[0].slice(0, 32) || 'member';
        await db
          .prepare('INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)')
          .bind(existingBinding.user_id, defaultName, nowIso)
          .run();
        user = { id: existingBinding.user_id, username: defaultName, email, created_at: nowIso };
      }
    } else {
      const userId = crypto.randomUUID();
      const defaultName = email.split('@')[0].slice(0, 32) || 'member';
      await db
        .prepare('INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)')
        .bind(userId, defaultName, nowIso)
        .run();
      await db
        .prepare(
          'INSERT INTO user_auth_emails (user_id, email, verified_at, created_at) VALUES (?, ?, ?, ?)'
        )
        .bind(userId, email, nowIso, nowIso)
        .run();
      user = { id: userId, username: defaultName, email, created_at: nowIso };
    }

    // Issue session token + HttpOnly cookie
    const rawToken = generateRandomToken(32);
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .prepare(
        `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`
      )
      .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, nowIso)
      .run();

    c.header(
      'Set-Cookie',
      `session_token=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    );

    return c.json({ token: rawToken, user }, 200);
  } catch (err: any) {
    console.error('Error in POST /auth/verify-code:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to verify code' },
      500
    );
  }
});

// GET /api/v1/auth/me
authRoute.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const authType = c.get('authType');

  try {
    const db = getDb(c);
    const row = await db
      .prepare(
        `SELECT u.id, u.username, u.created_at, e.email
         FROM users u
         LEFT JOIN user_auth_emails e ON e.user_id = u.id
         WHERE u.id = ?`
      )
      .bind(userId)
      .first<{ id: string; username: string; created_at: string; email: string | null }>();

    if (!row) {
      return c.json({ error: '401_UNAUTHORIZED', message: 'User not found' }, 401);
    }

    return c.json(
      {
        authenticated: true,
        auth_type: authType,
        user: {
          id: row.id,
          username: row.username,
          email: row.email ?? null,
          created_at: row.created_at,
        },
      },
      200
    );
  } catch (err: any) {
    console.error('Error in GET /auth/me:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Database error' }, 500);
  }
});

// POST /api/v1/auth/logout
authRoute.post('/logout', async (c) => {
  try {
    const bearerToken = extractBearerToken(c.req.header('Authorization'));
    const cookieToken = getCookieValue(c.req.header('Cookie'), 'session_token');
    const rawToken = bearerToken || cookieToken;

    if (rawToken) {
      const db = getDb(c);
      const tokenHash = await sha256Hex(rawToken);
      await db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ?')
        .bind(new Date().toISOString(), tokenHash)
        .run();
    }

    c.header(
      'Set-Cookie',
      'session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );

    return c.json({ success: true }, 200);
  } catch (err: any) {
    console.error('Error in POST /auth/logout:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to logout' }, 500);
  }
});
