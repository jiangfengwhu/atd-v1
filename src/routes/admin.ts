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
import { isValidFromEmail, makeContentPreview, maskApiKey } from '../lib/validation';
import {
  createOrUpdateNotification,
  getUnreadNotificationRecipientsForPost,
  pushNotificationReadSyncForUsers,
} from '../lib/notifications';
import {
  getFeedbackTicketStatusLabel,
  isValidFeedbackTicketStatus,
  serializeFeedbackTicket,
} from '../lib/feedback-tickets';
import {
  OFFICIAL_FEEDBACK_BADGE,
  OFFICIAL_FEEDBACK_HANDLE,
  OFFICIAL_FEEDBACK_NICKNAME,
  OFFICIAL_FEEDBACK_USER_ID,
  ensureOfficialFeedbackAccount,
} from '../lib/official';

const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const LOCK_DURATION_MS = 5 * 60 * 1000;

export async function isValidAdminSession(
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
    `SELECT p.id, p.content, p.image_url, p.likes_count, p.comments_count, p.created_at,
            u.id AS author_id, u.nickname AS author_nickname, u.email AS author_email
     FROM posts p
     JOIN users u ON u.id = p.author_id
     ORDER BY p.created_at DESC
     LIMIT 50`
  ).all<{
    id: string;
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
      content: r.content,
      contentPreview: makeContentPreview(r.content, 80),
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
    c.env.DB.prepare('DELETE FROM comment_ticket_events WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM feedback_tickets WHERE post_id = ?').bind(postId),
    c.env.DB.prepare('DELETE FROM post_mentions WHERE post_id = ?').bind(postId),
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

adminRoutes.get('/feedback-tickets', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const rawStatus = (c.req.query('status') || '').trim();
  const hasFilter = rawStatus && rawStatus !== 'all';
  if (hasFilter && !isValidFeedbackTicketStatus(rawStatus)) {
    return c.json({ error: '工单状态筛选参数无效' }, 400);
  }

  const whereSql = hasFilter ? 'WHERE ft.status = ?' : '';
  const bindings = hasFilter ? [rawStatus] : [];

  const rows = await c.env.DB.prepare(
    `SELECT ft.id, ft.post_id, ft.author_id, ft.feedback_queue_id, ft.content,
            ft.status, ft.status_note, ft.updated_by_admin, ft.created_at, ft.updated_at,
            p.content AS post_content, p.comments_count AS post_comments_count, p.created_at AS post_created_at,
            u.nickname AS author_nickname, u.email AS author_email
     FROM feedback_tickets ft
     JOIN posts p ON p.id = ft.post_id
     JOIN users u ON u.id = ft.author_id
     ${whereSql}
     ORDER BY ft.created_at DESC
     LIMIT 100`
  )
    .bind(...bindings)
    .all<{
      id: string;
      post_id: string;
      author_id: string;
      feedback_queue_id: string;
      content: string;
      status: string;
      status_note: string;
      updated_by_admin: number;
      created_at: string;
      updated_at: string;
      post_content: string;
      post_comments_count: number;
      post_created_at: string;
      author_nickname: string;
      author_email: string;
    }>();

  return c.json({
    tickets: (rows.results ?? []).map((r) => ({
      ...serializeFeedbackTicket(r),
      content: r.content,
      post: {
        id: r.post_id,
        content: r.post_content,
        contentPreview: makeContentPreview(r.post_content, 100),
        commentsCount: Number(r.post_comments_count ?? 0),
        createdAt: r.post_created_at,
      },
      author: {
        id: r.author_id,
        nickname: r.author_nickname,
        email: r.author_email,
      },
    })),
  });
});

adminRoutes.post('/feedback-tickets/:id/reply', async (c) => {
  const authed = await isValidAdminSession(c.env.DB, c.req.header('cookie'));
  if (!authed) {
    return c.json({ error: '未授权访问管理后台' }, 401);
  }

  const ticketId = c.req.param('id');
  const body = await c.req
    .json<{ status?: unknown; content?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求体格式错误' }, 400);
  }

  if (!isValidFeedbackTicketStatus(body.status)) {
    return c.json({ error: '请选择有效的工单状态' }, 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (content.length < 1 || content.length > 1000) {
    return c.json({ error: '回复内容长度需在 1 到 1000 个字符之间' }, 400);
  }

  const ticket = await c.env.DB.prepare(
    `SELECT ft.id, ft.post_id, ft.author_id, ft.feedback_queue_id, ft.status, ft.created_at
     FROM feedback_tickets ft
     JOIN posts p ON p.id = ft.post_id
     WHERE ft.id = ?
     LIMIT 1`
  )
    .bind(ticketId)
    .first<{
      id: string;
      post_id: string;
      author_id: string;
      feedback_queue_id: string;
      status: string;
      created_at: string;
    }>();

  if (!ticket) {
    return c.json({ error: '反馈工单或关联帖子不存在' }, 404);
  }

  await ensureOfficialFeedbackAccount(c.env.DB);

  const nextStatus = body.status;
  const fromStatus = isValidFeedbackTicketStatus(ticket.status) ? ticket.status : 'pending';
  const commentId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(commentId, ticket.post_id, OFFICIAL_FEEDBACK_USER_ID, content, nowIso),
    c.env.DB.prepare(
      `INSERT INTO comment_ticket_events (id, comment_id, ticket_id, post_id, from_status, to_status, actor_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)`
    ).bind(eventId, commentId, ticket.id, ticket.post_id, fromStatus, nextStatus, nowIso),
    c.env.DB.prepare(
      `UPDATE feedback_tickets
       SET status = ?, status_note = ?, last_reply_comment_id = ?, updated_by_admin = 1, updated_at = ?
       WHERE id = ?`
    ).bind(nextStatus, content, commentId, nowIso, ticket.id),
    c.env.DB.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').bind(
      ticket.post_id
    ),
  ]);

  const statusLabel = getFeedbackTicketStatusLabel(nextStatus);
  await createOrUpdateNotification(c.env, {
    recipientId: ticket.author_id,
    actorId: OFFICIAL_FEEDBACK_USER_ID,
    type: 'comment',
    postId: ticket.post_id,
    commentId,
    contentPreview: `[工单${statusLabel}] ${content}`,
  });

  return c.json(
    {
      ok: true,
      ticket: serializeFeedbackTicket({
        id: ticket.id,
        post_id: ticket.post_id,
        feedback_queue_id: ticket.feedback_queue_id,
        status: nextStatus,
        status_note: content,
        updated_by_admin: 1,
        created_at: ticket.created_at,
        updated_at: nowIso,
      }),
      comment: {
        id: commentId,
        postId: ticket.post_id,
        content,
        author: {
          id: OFFICIAL_FEEDBACK_USER_ID,
          nickname: OFFICIAL_FEEDBACK_NICKNAME,
          avatarSeed: OFFICIAL_FEEDBACK_HANDLE,
          avatarUrl: '',
          isOfficial: true,
          officialBadge: OFFICIAL_FEEDBACK_BADGE,
        },
        ticketEvent: {
          ticketId: ticket.id,
          fromStatus,
          toStatus: nextStatus,
          fromStatusLabel: getFeedbackTicketStatusLabel(fromStatus),
          toStatusLabel: statusLabel,
        },
        replies: [],
        createdAt: nowIso,
      },
    },
    201
  );
});
