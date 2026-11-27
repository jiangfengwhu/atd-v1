import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv, AuthUser } from '../types';
import { ensureAdminConfig } from '../lib/admin-config';
import {
  MAX_VAULT_SESSIONS,
  USER_SESSION_COOKIE,
  USER_SESSION_VAULT_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  getCookieValue,
  isHttpsRequest,
  parseSessionVaultCookie,
  serializeSessionVault,
} from '../lib/cookies';
import {
  constantTimeEqual,
  randomSixDigitOtp,
  randomTokenHex,
  sha256Hex,
} from '../lib/crypto';
import { isValidEmail, isValidImageUrl } from '../lib/validation';
import {
  ensureOfficialFeedbackAccount,
  isOfficialAccountEmail,
  isOfficialUserId,
  isReservedOfficialNickname,
} from '../lib/official';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const USER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  avatar_seed: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
}

interface VaultSessionRow extends UserRow {
  token_hash: string;
}

interface VaultEntry {
  user: AuthUser;
  token: string;
  tokenHash: string;
  isActive: boolean;
}

function mapUserRow(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatarSeed: row.avatar_seed,
    avatarUrl: row.avatar_url ?? '',
    bio: row.bio ?? '',
    createdAt: row.created_at,
  };
}

async function resolveVaultAccounts(
  db: D1Database,
  cookieHeader: string | undefined
): Promise<{ activeUserId: string | null; activeTokenHash: string | null; entries: VaultEntry[] }> {
  const activeToken = getCookieValue(cookieHeader, USER_SESSION_COOKIE);
  const vaultTokens = parseSessionVaultCookie(cookieHeader);

  const candidateTokens: string[] = [];
  const seenTokens = new Set<string>();
  for (const t of [activeToken, ...vaultTokens]) {
    if (t && !seenTokens.has(t)) {
      seenTokens.add(t);
      candidateTokens.push(t);
    }
  }

  if (candidateTokens.length === 0) {
    return { activeUserId: null, activeTokenHash: null, entries: [] };
  }

  const tokenHashes = await Promise.all(candidateTokens.map((t) => sha256Hex(t)));
  const activeTokenHash = activeToken ? tokenHashes[0] : null;
  const now = new Date().toISOString();
  const placeholders = tokenHashes.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT s.token_hash, u.id, u.email, u.nickname, u.avatar_seed, u.created_at,
              COALESCE(up.avatar_url, '') AS avatar_url,
              COALESCE(up.bio, '') AS bio
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE s.token_hash IN (${placeholders}) AND s.expires_at > ?`
    )
    .bind(...tokenHashes, now)
    .all<VaultSessionRow>();

  const byHash = new Map<string, VaultSessionRow>();
  for (const r of rows.results ?? []) {
    byHash.set(r.token_hash, r);
  }

  const activeRow = activeTokenHash ? byHash.get(activeTokenHash) : undefined;
  const activeUserId = activeRow ? activeRow.id : null;

  const entries: VaultEntry[] = [];
  const seenUsers = new Set<string>();
  for (let i = 0; i < candidateTokens.length; i += 1) {
    const token = candidateTokens[i];
    const tokenHash = tokenHashes[i];
    const row = byHash.get(tokenHash);
    if (!row || seenUsers.has(row.id)) continue;
    seenUsers.add(row.id);
    entries.push({
      user: mapUserRow(row),
      token,
      tokenHash,
      isActive: activeUserId === row.id,
    });
    if (entries.length >= MAX_VAULT_SESSIONS) break;
  }

  return { activeUserId, activeTokenHash, entries };
}

function serializeAccountSummaries(entries: VaultEntry[], activeUserId: string | null) {
  return entries.map((e) => ({
    id: e.user.id,
    email: e.user.email,
    nickname: e.user.nickname,
    avatarSeed: e.user.avatarSeed,
    avatarUrl: e.user.avatarUrl,
    bio: e.user.bio,
    createdAt: e.user.createdAt,
    isActive: e.user.id === activeUserId,
  }));
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
      `SELECT u.id, u.email, u.nickname, u.avatar_seed, u.created_at,
              COALESCE(up.avatar_url, '') AS avatar_url,
              COALESCE(up.bio, '') AS bio
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, now)
    .first<UserRow>();

  if (!row) return null;
  return mapUserRow(row);
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

  await ensureOfficialFeedbackAccount(c.env.DB);
  if (await isOfficialAccountEmail(c.env.DB, rawEmail)) {
    return c.json({ error: '官方系统账号不支持直接登录' }, 403);
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
  const siteName = config.site_name.trim() || 'dev社区';

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

  await ensureOfficialFeedbackAccount(c.env.DB);
  if (await isOfficialAccountEmail(c.env.DB, rawEmail)) {
    return c.json({ error: '官方系统账号不支持直接登录' }, 403);
  }
  if (requestedNickname && isReservedOfficialNickname(requestedNickname)) {
    return c.json({ error: '该昵称为系统保留官方账号名称，请更换其他昵称' }, 400);
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
    `SELECT u.id, u.email, u.nickname, u.avatar_seed, u.created_at,
            COALESCE(up.avatar_url, '') AS avatar_url,
            COALESCE(up.bio, '') AS bio
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.email = ?
     LIMIT 1`
  )
    .bind(rawEmail)
    .first<UserRow>();

  if (!user) {
    const userId = crypto.randomUUID();
    const rawDefaultNick = requestedNickname || rawEmail.split('@')[0].slice(0, 24) || '社区旅人';
    const defaultNick = isReservedOfficialNickname(rawDefaultNick)
      ? `${rawDefaultNick.slice(0, 20)}_user`
      : rawDefaultNick;
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
      avatar_url: '',
      bio: '',
      created_at: nowIso,
    };
  }

  const existingVault = await resolveVaultAccounts(c.env.DB, c.req.header('cookie'));

  const rawToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const sessionExpiresAt = new Date(Date.now() + USER_SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), user.id, tokenHash, sessionExpiresAt, nowIso)
    .run();

  // Deduplicate same-user tokens and enforce max 5 accounts in vault
  const replacedEntries = existingVault.entries.filter((e) => e.user.id === user!.id);
  const keptEntries = existingVault.entries.filter((e) => e.user.id !== user!.id);
  const overflowedEntries = keptEntries.slice(MAX_VAULT_SESSIONS - 1);
  const finalKeptEntries = keptEntries.slice(0, MAX_VAULT_SESSIONS - 1);

  const hashesToRevoke = [...replacedEntries, ...overflowedEntries].map((e) => e.tokenHash);
  if (hashesToRevoke.length > 0) {
    const placeholders = hashesToRevoke.map(() => '?').join(', ');
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash IN (${placeholders})`)
      .bind(...hashesToRevoke)
      .run();
  }

  const nextVaultTokens = [rawToken, ...finalKeptEntries.map((e) => e.token)];
  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header(
    'Set-Cookie',
    buildSessionCookie(USER_SESSION_COOKIE, rawToken, USER_SESSION_TTL_SECONDS, secure)
  );
  c.header(
    'Set-Cookie',
    buildSessionCookie(
      USER_SESSION_VAULT_COOKIE,
      serializeSessionVault(nextVaultTokens),
      USER_SESSION_TTL_SECONDS,
      secure
    ),
    { append: true }
  );

  return c.json({
    ok: true,
    user: mapUserRow(user),
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
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
    },
  });
});

authRoutes.get('/accounts', async (c) => {
  const { activeUserId, entries } = await resolveVaultAccounts(c.env.DB, c.req.header('cookie'));
  return c.json({
    activeUserId,
    accounts: serializeAccountSummaries(entries, activeUserId),
  });
});

authRoutes.post('/switch', async (c) => {
  const { activeUserId, entries } = await resolveVaultAccounts(c.env.DB, c.req.header('cookie'));
  if (!activeUserId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json<{ userId?: unknown }>().catch(() => null);
  const targetUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!targetUserId) {
    return c.json({ error: '请提供要切换的账号 ID' }, 400);
  }

  const targetEntry = entries.find((e) => e.user.id === targetUserId);
  if (!targetEntry) {
    return c.json({ error: '目标账号未在当前浏览器登录或已退出' }, 403);
  }

  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header(
    'Set-Cookie',
    buildSessionCookie(USER_SESSION_COOKIE, targetEntry.token, USER_SESSION_TTL_SECONDS, secure)
  );
  c.header(
    'Set-Cookie',
    buildSessionCookie(
      USER_SESSION_VAULT_COOKIE,
      serializeSessionVault(entries.map((e) => e.token)),
      USER_SESSION_TTL_SECONDS,
      secure
    ),
    { append: true }
  );

  return c.json({
    ok: true,
    user: targetEntry.user,
    accounts: serializeAccountSummaries(entries, targetUserId),
  });
});

authRoutes.post('/logout', async (c) => {
  const body = await c.req
    .json<{ userId?: unknown; all?: unknown }>()
    .catch(() => ({} as { userId?: unknown; all?: unknown }));
  const logoutAll = Boolean(body && typeof body === 'object' && body.all === true);
  const requestedUserId =
    body && typeof body === 'object' && typeof body.userId === 'string'
      ? body.userId.trim()
      : '';

  const cookieHeader = c.req.header('cookie');
  const { activeUserId, activeTokenHash, entries } = await resolveVaultAccounts(
    c.env.DB,
    cookieHeader
  );
  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);

  if (logoutAll) {
    const hashesToDelete = Array.from(
      new Set([
        ...entries.map((e) => e.tokenHash),
        ...(activeTokenHash ? [activeTokenHash] : []),
      ])
    );
    if (hashesToDelete.length > 0) {
      const placeholders = hashesToDelete.map(() => '?').join(', ');
      await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash IN (${placeholders})`)
        .bind(...hashesToDelete)
        .run();
    }
    c.header('Set-Cookie', clearSessionCookie(USER_SESSION_COOKIE, secure));
    c.header('Set-Cookie', clearSessionCookie(USER_SESSION_VAULT_COOKIE, secure), {
      append: true,
    });
    return c.json({ ok: true, activeUser: null, accounts: [] });
  }

  if (requestedUserId) {
    const targetEntry = entries.find((e) => e.user.id === requestedUserId);
    if (!targetEntry) {
      return c.json({ error: '无权退出未在当前浏览器登录的账号' }, 403);
    }

    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(targetEntry.tokenHash)
      .run();

    const remaining = entries.filter((e) => e.user.id !== requestedUserId);
    const nextActive =
      requestedUserId === activeUserId
        ? remaining[0] ?? null
        : remaining.find((e) => e.user.id === activeUserId) ?? remaining[0] ?? null;

    if (nextActive) {
      c.header(
        'Set-Cookie',
        buildSessionCookie(USER_SESSION_COOKIE, nextActive.token, USER_SESSION_TTL_SECONDS, secure)
      );
      c.header(
        'Set-Cookie',
        buildSessionCookie(
          USER_SESSION_VAULT_COOKIE,
          serializeSessionVault(remaining.map((e) => e.token)),
          USER_SESSION_TTL_SECONDS,
          secure
        ),
        { append: true }
      );
    } else {
      c.header('Set-Cookie', clearSessionCookie(USER_SESSION_COOKIE, secure));
      c.header('Set-Cookie', clearSessionCookie(USER_SESSION_VAULT_COOKIE, secure), {
        append: true,
      });
    }

    return c.json({
      ok: true,
      activeUser: nextActive?.user ?? null,
      accounts: serializeAccountSummaries(remaining, nextActive?.user.id ?? null),
    });
  }

  // Default: logout current active session and fall back to next remaining vault session if any
  const hashesToDelete = Array.from(
    new Set([
      ...(activeTokenHash ? [activeTokenHash] : []),
      ...entries.filter((e) => e.user.id === activeUserId).map((e) => e.tokenHash),
    ])
  );
  if (hashesToDelete.length > 0) {
    const placeholders = hashesToDelete.map(() => '?').join(', ');
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash IN (${placeholders})`)
      .bind(...hashesToDelete)
      .run();
  }

  const remaining = activeUserId ? entries.filter((e) => e.user.id !== activeUserId) : entries;
  const nextActive = remaining[0] ?? null;

  if (nextActive) {
    c.header(
      'Set-Cookie',
      buildSessionCookie(USER_SESSION_COOKIE, nextActive.token, USER_SESSION_TTL_SECONDS, secure)
    );
    c.header(
      'Set-Cookie',
      buildSessionCookie(
        USER_SESSION_VAULT_COOKIE,
        serializeSessionVault(remaining.map((e) => e.token)),
        USER_SESSION_TTL_SECONDS,
        secure
      ),
      { append: true }
    );
  } else {
    c.header('Set-Cookie', clearSessionCookie(USER_SESSION_COOKIE, secure));
    c.header('Set-Cookie', clearSessionCookie(USER_SESSION_VAULT_COOKIE, secure), {
      append: true,
    });
  }

  return c.json({
    ok: true,
    activeUser: nextActive?.user ?? null,
    accounts: serializeAccountSummaries(remaining, nextActive?.user.id ?? null),
  });
});

authRoutes.patch('/profile', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }
  if (await isOfficialUserId(c.env.DB, user.id)) {
    return c.json({ error: '官方系统账号资料不可修改' }, 403);
  }

  const body = await c.req
    .json<{ nickname?: unknown; bio?: unknown; avatarUrl?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const hasNickname = body.nickname !== undefined;
  const hasBio = body.bio !== undefined;
  const hasAvatarUrl = body.avatarUrl !== undefined;

  if (!hasNickname && !hasBio && !hasAvatarUrl) {
    return c.json({ error: '请至少提供一项需要更新的资料字段' }, 400);
  }

  let nextNickname = user.nickname;
  if (hasNickname) {
    if (typeof body.nickname !== 'string') {
      return c.json({ error: '昵称格式无效' }, 400);
    }
    const trimmed = body.nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      return c.json({ error: '昵称长度需在 1 到 30 个字符之间' }, 400);
    }
    if (isReservedOfficialNickname(trimmed)) {
      return c.json({ error: '该昵称为系统保留官方账号名称，请更换其他昵称' }, 400);
    }
    nextNickname = trimmed;
  }

  let nextBio = user.bio;
  if (hasBio) {
    if (typeof body.bio !== 'string') {
      return c.json({ error: '个人简介格式无效' }, 400);
    }
    const trimmed = body.bio.trim();
    if (trimmed.length > 200) {
      return c.json({ error: '个人简介不能超过 200 个字符' }, 400);
    }
    nextBio = trimmed;
  }

  let nextAvatarUrl = user.avatarUrl;
  if (hasAvatarUrl) {
    if (typeof body.avatarUrl !== 'string') {
      return c.json({ error: '头像链接格式无效' }, 400);
    }
    const trimmed = body.avatarUrl.trim();
    if (!isValidImageUrl(trimmed)) {
      return c.json({ error: '头像链接仅支持站内上传路径或 http/https 地址' }, 400);
    }
    nextAvatarUrl = trimmed;
  }

  const nowIso = new Date().toISOString();
  const statements = [];
  if (hasNickname) {
    statements.push(
      c.env.DB.prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?').bind(
        nextNickname,
        nowIso,
        user.id
      )
    );
  }
  if (hasBio || hasAvatarUrl) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO user_profiles (user_id, avatar_url, bio, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           avatar_url = excluded.avatar_url,
           bio = excluded.bio,
           updated_at = excluded.updated_at`
      ).bind(user.id, nextAvatarUrl, nextBio, nowIso)
    );
  }

  await c.env.DB.batch(statements);

  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: nextNickname,
      avatarSeed: user.avatarSeed,
      avatarUrl: nextAvatarUrl,
      bio: nextBio,
      createdAt: user.createdAt,
    },
  });
});
