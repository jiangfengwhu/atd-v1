import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import { ensureAdminConfig } from '../lib/admin-config';
import {
  ADMIN_SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  getCookieValue,
  isHttpsRequest,
} from '../lib/cookies';
import {
  hashPasswordPBKDF2,
  randomTokenHex,
  sha256Hex,
  verifyPasswordPBKDF2,
} from '../lib/crypto';
import { isValidFromEmail, maskApiKey } from '../lib/validation';
import {
  getUnreadNotificationRecipientsForPost,
  pushNotificationReadSyncForUsers,
} from '../lib/notifications';

const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const LOCK_DURATION_MS = 5 * 60 * 1000;

async function isValidAdminSession(
  db: D1Database,
  cookieHeader: string | undefined
): Promise<boolean> {
  const token = getCookieValue(cookieHeader, ADMIN_SESSION_COOKIE);
  if (!token) return false;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await db
    .prepare('SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1')
    .bind(tokenHash, now)
    .first<{ id: string }>();
  return Boolean(row);
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ password?: unknown }>().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    return c.json({ error: '请输入管理员密码' }, 400);
  }

  const config = await ensureAdminConfig(c.env.DB);
  if (config.locked_until && new Date(config.locked_until).getTime() > Date.now()) {
    return c.json({ error: '密码错误次数过多，请稍后再试' }, 429);
  }

  const ok = await verifyPasswordPBKDF2(password, config.password_hash);
  if (!ok) {
    const nextFailed = (config.failed_attempts || 0) + 1;
    const lockedUntil =
      nextFailed >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;
    await c.env.DB.prepare(
      'UPDATE admin_config SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = 1'
    )
      .bind(nextFailed, lockedUntil, new Date().toISOString())
      .run();
    return c.json({ error: '管理员密码错误' }, 401);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE admin_config SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = 1'
  )
    .bind(nowIso)
    .run();

  const rawToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO admin_sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), tokenHash, expiresAt, nowIso)
    .run();

  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header(
    'Set-Cookie',
    buildSessionCookie(ADMIN_SESSION_COOKIE, rawToken, ADMIN_SESSION_TTL_SECONDS, secure)
  );

  return c.json({
    ok: true,
    mustChangeDefaultPassword: Boolean(config.is_default_password),
  });
});

adminRoutes.get('/me', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ authenticated: false });
  }
  const config = await ensureAdminConfig(c.env.DB);
  return c.json({
    authenticated: true,
    mustChangeDefaultPassword: Boolean(config.is_default_password),
  });
});

adminRoutes.post('/logout', async (c) => {
  const token = getCookieValue(c.req.header('cookie'), ADMIN_SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header('Set-Cookie', clearSessionCookie(ADMIN_SESSION_COOKIE, secure));
  return c.json({ ok: true });
});

adminRoutes.post('/password', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const body = await c.req
    .json<{ currentPassword?: unknown; newPassword?: unknown }>()
    .catch(() => null);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

  const isRestoringDefault = newPassword === 'admin';
  if (!currentPassword || (!isRestoringDefault && newPassword.length < 6) || newPassword.length > 128) {
    return c.json({ error: '新密码长度需在 6 到 128 个字符之间' }, 400);
  }

  const config = await ensureAdminConfig(c.env.DB);
  const validCurrent = await verifyPasswordPBKDF2(currentPassword, config.password_hash);
  if (!validCurrent) {
    return c.json({ error: '原密码不正确' }, 401);
  }

  const newHash = await hashPasswordPBKDF2(newPassword);
  const isDefault = newPassword === 'admin' ? 1 : 0;
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE admin_config SET password_hash = ?, is_default_password = ?, updated_at = ? WHERE id = 1'
  )
    .bind(newHash, isDefault, nowIso)
    .run();

  // Invalidate all previous admin sessions and rotate current caller session
  await c.env.DB.prepare('DELETE FROM admin_sessions').run();
  const rawToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO admin_sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), tokenHash, expiresAt, nowIso)
    .run();

  const secure = isHttpsRequest(c.req.url, c.req.raw.headers);
  c.header(
    'Set-Cookie',
    buildSessionCookie(ADMIN_SESSION_COOKIE, rawToken, ADMIN_SESSION_TTL_SECONDS, secure)
  );

  return c.json({ ok: true });
});

adminRoutes.get('/settings', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const config = await ensureAdminConfig(c.env.DB);
  const [usersRow, postsRow, commentsRow] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM posts').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM comments').first<{ count: number }>(),
  ]);

  const rawKey = config.resend_api_key.trim();
  return c.json({
    hasResendApiKey: Boolean(rawKey),
    resendApiKeyMasked: maskApiKey(rawKey),
    resendFromEmail: config.resend_from_email,
    siteName: config.site_name,
    stats: {
      usersCount: Number(usersRow?.count ?? 0),
      postsCount: Number(postsRow?.count ?? 0),
      commentsCount: Number(commentsRow?.count ?? 0),
    },
    updatedAt: config.updated_at,
  });
});

adminRoutes.put('/settings', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const body = await c.req
    .json<{ resendApiKey?: unknown; resendFromEmail?: unknown; siteName?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求体格式错误' }, 400);
  }

  const config = await ensureAdminConfig(c.env.DB);

  let nextApiKey = config.resend_api_key;
  if (body.resendApiKey !== undefined) {
    if (typeof body.resendApiKey !== 'string' || body.resendApiKey.trim().length > 200) {
      return c.json({ error: 'Resend API Key 格式无效' }, 400);
    }
    nextApiKey = body.resendApiKey.trim();
  }

  let nextFromEmail = config.resend_from_email;
  if (body.resendFromEmail !== undefined) {
    if (typeof body.resendFromEmail !== 'string') {
      return c.json({ error: '发件邮箱格式无效' }, 400);
    }
    const trimmedFrom = body.resendFromEmail.trim();
    if (trimmedFrom === '') {
      nextFromEmail = 'onboarding@resend.dev';
    } else if (!isValidFromEmail(trimmedFrom)) {
      return c.json({ error: '发件邮箱格式无效' }, 400);
    } else {
      nextFromEmail = trimmedFrom;
    }
  }

  let nextSiteName = config.site_name;
  if (body.siteName !== undefined) {
    if (typeof body.siteName !== 'string') {
      return c.json({ error: '社区名称格式无效' }, 400);
    }
    const trimmedSite = body.siteName.trim();
    if (trimmedSite.length < 1 || trimmedSite.length > 60) {
      return c.json({ error: '社区名称长度需在 1 到 60 个字符之间' }, 400);
    }
    nextSiteName = trimmedSite;
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE admin_config
     SET resend_api_key = ?, resend_from_email = ?, site_name = ?, updated_at = ?
     WHERE id = 1`
  )
    .bind(nextApiKey, nextFromEmail, nextSiteName, nowIso)
    .run();

  return c.json({
    ok: true,
    hasResendApiKey: Boolean(nextApiKey),
    resendApiKeyMasked: maskApiKey(nextApiKey),
    resendFromEmail: nextFromEmail,
    siteName: nextSiteName,
  });
});

adminRoutes.get('/posts', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.content, p.image_url, p.likes_count, p.comments_count, p.created_at,
            u.id AS author_id, u.nickname AS author_nickname, u.email AS author_email
     FROM posts p
     JOIN users u ON u.id = p.author_id
     ORDER BY p.created_at DESC
     LIMIT 50`
  ).all<{
    id: string;
    title: string;
    content: string;
    image_url: string;
    likes_count: number;
    comments_count: number;
    created_at: string;
    author_id: string;
    author_nickname: string;
    author_email: string;
  }>();

  return c.json({
    posts: (rows.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      imageUrl: r.image_url,
      likesCount: Number(r.likes_count),
      commentsCount: Number(r.comments_count),
      createdAt: r.created_at,
      author: {
        id: r.author_id,
        nickname: r.author_nickname,
        email: r.author_email,
      },
    })),
  });
});

adminRoutes.delete('/posts/:id', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const postId = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string }>();

  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const affectedRecipients = await getUnreadNotificationRecipientsForPost(c.env.DB, postId);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM notifications WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM post_bookmarks WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM post_metrics WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM comment_replies WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId),
  ]);

  if (affectedRecipients.length > 0) {
    await pushNotificationReadSyncForUsers(c.env, affectedRecipients);
  }

  return c.json({ ok: true });
});
