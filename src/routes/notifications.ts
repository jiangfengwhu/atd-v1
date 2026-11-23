import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import {
  getNotificationsUnreadCount,
  serializeNotification,
  type NotificationRow,
} from '../lib/notifications';
import { pushUserEvent } from '../lib/realtime';

const VALID_TYPES = new Set(['all', 'comment', 'like', 'follow']);

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get('/', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const rawType = c.req.query('type');
  const type = rawType === undefined ? 'all' : rawType;
  const limitRaw = c.req.query('limit');
  const offsetRaw = c.req.query('offset');

  const limit = limitRaw !== undefined ? Number(limitRaw) : 30;
  const offset = offsetRaw !== undefined ? Number(offsetRaw) : 0;

  if (
    !VALID_TYPES.has(type) ||
    limitRaw === '' ||
    offsetRaw === '' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return c.json({ error: '通知查询参数无效' }, 400);
  }

  const whereSql =
    type === 'all' ? 'n.recipient_id = ?' : 'n.recipient_id = ? AND n.type = ?';
  const filterBindings = type === 'all' ? [user.id] : [user.id, type];

  const [countRow, unreadCount, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM notifications n WHERE ${whereSql}`)
      .bind(...filterBindings)
      .first<{ total: number }>(),
    getNotificationsUnreadCount(c.env.DB, user.id),
    c.env.DB.prepare(
      `SELECT n.id, n.recipient_id, n.actor_id, n.type, n.post_id, n.comment_id,
              n.content_preview, n.is_read, n.created_at,
              u.nickname AS actor_nickname, u.avatar_seed AS actor_avatar_seed,
              COALESCE(up.avatar_url, '') AS actor_avatar_url,
              p.id AS joined_post_id, p.title AS post_title, p.image_url AS post_image_url
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN posts p ON p.id = n.post_id
       WHERE ${whereSql}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...filterBindings, limit, offset)
      .all<NotificationRow>(),
  ]);

  return c.json({
    notifications: (rows.results ?? []).map(serializeNotification),
    total: Number(countRow?.total ?? 0),
    unreadCount,
  });
});

notificationRoutes.get('/unread-count', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const [notificationsUnread, dmRow] = await Promise.all([
    getNotificationsUnreadCount(c.env.DB, user.id),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM direct_messages WHERE receiver_id = ? AND is_read = 0'
    )
      .bind(user.id)
      .first<{ cnt: number }>(),
  ]);

  const messagesUnread = Number(dmRow?.cnt ?? 0);
  return c.json({
    notificationsUnread,
    messagesUnread,
    totalUnread: notificationsUnread + messagesUnread,
  });
});

notificationRoutes.post('/read', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req
    .json<{ all?: unknown; ids?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  if (body.all === true) {
    await c.env.DB.prepare(
      'UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND is_read = 0'
    )
      .bind(user.id)
      .run();

    const unreadCount = await getNotificationsUnreadCount(c.env.DB, user.id);
    await pushUserEvent(c.env, user.id, {
      type: 'notification:read',
      unreadCount,
      all: true,
    });

    return c.json({ ok: true, unreadCount });
  }

  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100) {
    return c.json({ error: '请指定要标记已读的通知 ID 或设置 all: true' }, 400);
  }

  const cleanIds: string[] = [];
  for (const item of body.ids) {
    if (typeof item !== 'string' || !item.trim()) {
      return c.json({ error: '通知 ID 格式无效' }, 400);
    }
    cleanIds.push(item.trim());
  }
  const uniqueIds = Array.from(new Set(cleanIds));
  const placeholders = uniqueIds.map(() => '?').join(', ');

  await c.env.DB.prepare(
    `UPDATE notifications
     SET is_read = 1
     WHERE recipient_id = ? AND is_read = 0 AND id IN (${placeholders})`
  )
    .bind(user.id, ...uniqueIds)
    .run();

  const unreadCount = await getNotificationsUnreadCount(c.env.DB, user.id);
  await pushUserEvent(c.env, user.id, {
    type: 'notification:read',
    unreadCount,
    ids: uniqueIds,
  });

  return c.json({ ok: true, unreadCount });
});
