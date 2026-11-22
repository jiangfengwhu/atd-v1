import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv, AuthUser } from '../types';
import { ensureAdminConfig } from '../lib/admin-config';
import {
  USER_SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  getCookieValue,
  isHttpsRequest,
} from '../lib/cookies';
import {
  constantTimeEqual,
  randomSixDigitOtp,
  randomTokenHex,
  sha256Hex,
} from '../lib/crypto';
import { isValidEmail } from '../lib/validation';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const USER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  avatar_seed: string;
  created_at: string;
}

export async function getSessionUser(
  db: D1Database,
  cookieHeader: string | undefined
): Promise<AuthUser | null> {
  const token = getCookieValue(cookieHeader, USER_SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.nickname, u.avatar_seed, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, now)
    .first<UserRow>();

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatarSeed: row.avatar_seed,
    createdAt: row.created_at,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/send-code', async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => null);
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(rawEmail)) {
    return c.json({ error: '请输入有效的邮箱地址' }, 400);
  }

  // Enforce 60-second cooldown per email
  const latestOtp = await c.env.DB.prepare(
    'SELECT created_at FROM email_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1'
  )
    .bind(rawEmail)
    .first<{ created_at: string }>();

  if (latestOtp) {
    const elapsed = Date.now() - new Date(latestOtp.created_at).getTime();
    if (elapsed >= 0 && elapsed < OTP_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
      return c.json({ error: `发送过于频繁，请 ${waitSec} 秒后再试` }, 429);
    }
  }

  const code = randomSixDigitOtp();
  const codeHash = await sha256Hex(`${rawEmail}:${code}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const otpId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO email_otps (id, email, code_hash, attempts, consumed, expires_at, created_at)
     VALUES (?, ?, ?, 0, 0, ?, ?)`
  )
    .bind(otpId, rawEmail, codeHash, expiresAt, now.toISOString())
    .run();

  const config = await ensureAdminConfig(c.env.DB);
  const resendApiKey = config.resend_api_key.trim() || (c.env.RESEND_API_KEY ?? '').trim();
  const fromEmail =
    config.resend_from_email.trim() ||
    (c.env.RESEND_FROM_EMAIL ?? '').trim() ||
    'onboarding@resend.dev';
  const siteName = config.site_name.trim() || '拾光集 · 轻图文社区';

  if (resendApiKey) {
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#faf8f5;border-radius:16px;color:#18181b;">
        <h2 style="margin:0 0 12px;font-size:20px;">${escapeHtml(siteName)}</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#52525b;">你正在登录社区账号，请使用下方 6 位一次性验证码（10 分钟内有效）：</p>
        <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:18px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;">
          ${code}
        </div>
        <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">如果这不是你的操作，请忽略此邮件。</p>
      </div>
    `;

    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [rawEmail],
          subject: `${siteName} 登录验证码：${code}`,
          html,
        }),
      });

      if (!resendRes.ok) {
        await c.env.DB.prepare('DELETE FROM email_otps WHERE id = ?').bind(otpId).run();
        return c.json({ error: 'Resend 邮件发送失败，请检查后台 Resend 配置' }, 502);
      }

      return c.json({
        ok: true,
        expiresInSeconds: 600,
        deliveryMode: 'resend' as const,
      });
    } catch {
      await c.env.DB.prepare('DELETE FROM email_otps WHERE id = ?').bind(otpId).run();
      return c.json({ error: '无法连接 Resend 邮件服务，请稍后重试' }, 502);
    }
  }

  let hostname = '';
  try {
    hostname = new URL(c.req.url).hostname.toLowerCase();
  } catch {
    hostname = '';
  }
  const allowDevFallback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    c.env.ALLOW_DEV_OTP_FALLBACK === 'true';

  if (!allowDevFallback) {
    await c.env.DB.prepare('DELETE FROM email_otps WHERE id = ?').bind(otpId).run();
    return c.json(
      { error: '邮件服务尚未配置，请联系管理员前往 /admin 配置 Resend API Key' },
      503
    );
  }

  return c.json({
    ok: true,
    expiresInSeconds: 600,
    deliveryMode: 'dev_fallback' as const,
    devCode: code,
  });
});

authRoutes.post('/verify-code', async (c) => {
  const body = await c.req
    .json<{ email?: unknown; code?: unknown; nickname?: unknown }>()
    .catch(() => null);
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const requestedNickname =
    typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 30) : '';

  if (!isValidEmail(rawEmail) || !/^\d{6}$/.test(code)) {
    return c.json({ error: '请输入正确的邮箱和 6 位数字验证码' }, 400);
  }

  const otp = await c.env.DB.prepare(
    `SELECT id, code_hash, attempts, expires_at
     FROM email_otps
     WHERE email = ? AND consumed = 0
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(rawEmail)
    .first<{ id: string; code_hash: string; attempts: number; expires_at: string }>();

  if (!otp) {
    return c.json({ error: '验证码无效或已失效，请重新获取' }, 401);
  }

  if (new Date(otp.expires_at).getTime() <= Date.now()) {
    await c.env.DB.prepare('UPDATE email_otps SET consumed = 1 WHERE id = ?')
      .bind(otp.id)
      .run();
    return c.json({ error: '验证码已过期，请重新获取' }, 401);
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await c.env.DB.prepare('UPDATE email_otps SET consumed = 1 WHERE id = ?')
      .bind(otp.id)
      .run();
    return c.json({ error: '验证码错误次数过多，请重新获取' }, 429);
  }

  const expectedHash = await sha256Hex(`${rawEmail}:${code}`);
  if (!constantTimeEqual(expectedHash, otp.code_hash)) {
    const nextAttempts = otp.attempts + 1;
    const exhausted = nextAttempts >= OTP_MAX_ATTEMPTS ? 1 : 0;
    await c.env.DB.prepare(
      'UPDATE email_otps SET attempts = ?, consumed = CASE WHEN ? = 1 THEN 1 ELSE consumed END WHERE id = ?'
    )
      .bind(nextAttempts, exhausted, otp.id)
      .run();
    return c.json({ error: '验证码错误，请核对后重试' }, 401);
  }

  // Atomically consume OTP to prevent replay
  const consumeRes = await c.env.DB.prepare(
    'UPDATE email_otps SET consumed = 1 WHERE id = ? AND consumed = 0'
  )
    .bind(otp.id)
    .run();
  if (!consumeRes.meta.changes || consumeRes.meta.changes < 1) {
    return c.json({ error: '验证码已被使用，请重新获取' }, 401);
  }

  const nowIso = new Date().toISOString();
  let user = await c.env.DB.prepare(
    'SELECT id, email, nickname, avatar_seed, created_at FROM users WHERE email = ? LIMIT 1'
  )
    .bind(rawEmail)
    .first<UserRow>();

  if (!user) {
    const userId = crypto.randomUUID();
    const defaultNick = requestedNickname || rawEmail.split('@')[0].slice(0, 24) || '社区旅人';
    const avatarSeed = (await sha256Hex(rawEmail)).slice(0, 12);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, nickname, avatar_seed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(userId, rawEmail, defaultNick, avatarSeed, nowIso, nowIso)
      .run();

    user = {
      id: userId,
      email: rawEmail,
      nickname: defaultNick,
      avatar_seed: avatarSeed,
      created_at: nowIso,
    };
  }

  const rawToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const sessionExpiresAt = new Date(Date.now() + USER_SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), user.id, tokenHash, sessionExpiresAt, nowIso)
    .run();

  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header(
    'Set-Cookie',
    buildSessionCookie(USER_SESSION_COOKIE, rawToken, USER_SESSION_TTL_SECONDS, secure)
  );

  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarSeed: user.avatar_seed,
      createdAt: user.created_at,
    },
  });
});

authRoutes.get('/me', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ authenticated: false, user: null });
  }
  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarSeed: user.avatarSeed,
    },
  });
});

authRoutes.post('/logout', async (c) => {
  const token = getCookieValue(c.req.header('cookie'), USER_SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header('Set-Cookie', clearSessionCookie(USER_SESSION_COOKIE, secure));
  return c.json({ ok: true });
});

authRoutes.patch('/profile', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json<{ nickname?: unknown }>().catch(() => null);
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  if (nickname.length < 1 || nickname.length > 30) {
    return c.json({ error: '昵称长度需在 1 到 30 个字符之间' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?')
    .bind(nickname, new Date().toISOString(), user.id)
    .run();

  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nickname,
      avatarSeed: user.avatarSeed,
    },
  });
});
