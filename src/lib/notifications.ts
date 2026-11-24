import type { D1Database } from '@cloudflare/workers-types';
import type { Bindings } from '../types';
import { pushUserEvent } from './realtime';
import { makeContentPreview } from './validation';

export type NotificationType = 'comment' | 'like' | 'follow';

export interface UnreadByType {
  comment: number;
  like: number;
  follow: number;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  content_preview: string;
  is_read: number;
  created_at: string;
  actor_nickname: string;
  actor_avatar_seed: string;
  actor_avatar_url: string | null;
  joined_post_id: string | null;
  post_content: string | null;
  post_image_url: string | null;
}

export function serializeNotification(row: NotificationRow) {
  const postContent = row.post_content ?? '';
  return {
    id: row.id,
    type: row.type,
    isRead: Boolean(row.is_read),
    contentPreview: row.content_preview,
    createdAt: row.created_at,
    actor: {
      id: row.actor_id,
      nickname: row.actor_nickname,
      avatarSeed: row.actor_avatar_seed,
      avatarUrl: row.actor_avatar_url ?? '',
    },
    post: row.joined_post_id
      ? {
          id: row.joined_post_id,
          content: postContent,
          contentPreview: makeContentPreview(postContent, 80),
          imageUrl: row.post_image_url ?? '',
        }
      : null,
    commentId: row.comment_id ?? null,
  };
}

export async function getNotificationsUnreadByType(
  db: D1Database,
  userId: string
): Promise<UnreadByType> {
  const rows = await db
    .prepare(
      `SELECT type, COUNT(*) AS cnt
       FROM notifications
       WHERE recipient_id = ? AND is_read = 0
       GROUP BY type`
    )
    .bind(userId)
    .all<{ type: NotificationType; cnt: number }>();

  const summary: UnreadByType = { comment: 0, like: 0, follow: 0 };
  for (const row of rows.results ?? []) {
    if (row.type === 'comment' || row.type === 'like' || row.type === 'follow') {
      summary[row.type] = Number(row.cnt ?? 0);
    }
  }
  return summary;
}

export function sumUnreadByType(unreadByType: UnreadByType): number {
  return unreadByType.comment + unreadByType.like + unreadByType.follow;
}

export async function getNotificationsUnreadCount(
  db: D1Database,
  userId: string
): Promise<number> {
  const unreadByType = await getNotificationsUnreadByType(db, userId);
  return sumUnreadByType(unreadByType);
}

export async function fetchSerializedNotification(db: D1Database, notificationId: string) {
  const row = await db
    .prepare(
      `SELECT n.id, n.recipient_id, n.actor_id, n.type, n.post_id, n.comment_id,
              n.content_preview, n.is_read, n.created_at,
              u.nickname AS actor_nickname, u.avatar_seed AS actor_avatar_seed,
              COALESCE(up.avatar_url, '') AS actor_avatar_url,
              p.id AS joined_post_id, p.content AS post_content, p.image_url AS post_image_url
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN posts p ON p.id = n.post_id
       WHERE n.id = ?
       LIMIT 1`
    )
    .bind(notificationId)
    .first<NotificationRow>();
  return row ? serializeNotification(row) : null;
}

/**
 * Create or deduplicate an unread notification and push it via WebSocket.
 */
export async function createOrUpdateNotification(
  env: Pick<Bindings, 'DB' | 'USER_REALTIME'>,
  params: {
    recipientId: string;
    actorId: string;
    type: NotificationType;
    postId?: string | null;
    commentId?: string | null;
    contentPreview?: string;
  }
): Promise<void> {
  const { recipientId, actorId, type } = params;
  if (!recipientId || !actorId || recipientId === actorId) {
    return;
  }

  const postId = params.postId ?? null;
  const commentId = params.commentId ?? null;
  const contentPreview = (params.contentPreview ?? '').slice(0, 160);
  const nowIso = new Date().toISOString();

  let notificationId: string | null = null;

  if (type === 'like' && postId) {
    const existing = await env.DB.prepare(
      `SELECT id FROM notifications
       WHERE recipient_id = ? AND actor_id = ? AND type = 'like' AND post_id = ? AND is_read = 0
       LIMIT 1`
    )
      .bind(recipientId, actorId, postId)
      .first<{ id: string }>();
    if (existing) {
      notificationId = existing.id;
      await env.DB.prepare(
        'UPDATE notifications SET content_preview = ?, created_at = ? WHERE id = ?'
      )
        .bind(contentPreview, nowIso, notificationId)
        .run();
    }
  } else if (type === 'follow') {
    const existing = await env.DB.prepare(
      `SELECT id FROM notifications
       WHERE recipient_id = ? AND actor_id = ? AND type = 'follow' AND is_read = 0
       LIMIT 1`
    )
      .bind(recipientId, actorId)
      .first<{ id: string }>();
    if (existing) {
      notificationId = existing.id;
      await env.DB.prepare('UPDATE notifications SET created_at = ? WHERE id = ?')
        .bind(nowIso, notificationId)
        .run();
    }
  }

  if (!notificationId) {
    notificationId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO notifications (id, recipient_id, actor_id, type, post_id, comment_id, content_preview, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
      .bind(notificationId, recipientId, actorId, type, postId, commentId, contentPreview, nowIso)
      .run();
  }

  const [notification, unreadByType] = await Promise.all([
    fetchSerializedNotification(env.DB, notificationId),
    getNotificationsUnreadByType(env.DB, recipientId),
  ]);

  if (notification) {
    await pushUserEvent(env, recipientId, {
      type: 'notification:new',
      notification,
      unreadCount: sumUnreadByType(unreadByType),
      unreadByType,
    });
  }
}

export async function clearUnreadLikeNotification(
  env: Pick<Bindings, 'DB' | 'USER_REALTIME'>,
  params: { recipientId: string; actorId: string; postId: string }
): Promise<void> {
  if (params.recipientId === params.actorId) return;
  const res = await env.DB.prepare(
    `DELETE FROM notifications
     WHERE recipient_id = ? AND actor_id = ? AND type = 'like' AND post_id = ? AND is_read = 0`
  )
    .bind(params.recipientId, params.actorId, params.postId)
    .run();

  if (res.meta.changes && res.meta.changes > 0) {
    const unreadByType = await getNotificationsUnreadByType(env.DB, params.recipientId);
    await pushUserEvent(env, params.recipientId, {
      type: 'notification:read',
      unreadCount: sumUnreadByType(unreadByType),
      unreadByType,
    });
  }
}

export async function clearUnreadFollowNotification(
  env: Pick<Bindings, 'DB' | 'USER_REALTIME'>,
  params: { recipientId: string; actorId: string }
): Promise<void> {
  if (params.recipientId === params.actorId) return;
  const res = await env.DB.prepare(
    `DELETE FROM notifications
     WHERE recipient_id = ? AND actor_id = ? AND type = 'follow' AND is_read = 0`
  )
    .bind(params.recipientId, params.actorId)
    .run();

  if (res.meta.changes && res.meta.changes > 0) {
    const unreadByType = await getNotificationsUnreadByType(env.DB, params.recipientId);
    await pushUserEvent(env, params.recipientId, {
      type: 'notification:read',
      unreadCount: sumUnreadByType(unreadByType),
      unreadByType,
    });
  }
}

export async function getUnreadNotificationRecipientsForPost(
  db: D1Database,
  postId: string
): Promise<string[]> {
  const rows = await db
    .prepare('SELECT DISTINCT recipient_id FROM notifications WHERE post_id = ? AND is_read = 0')
    .bind(postId)
    .all<{ recipient_id: string }>();
  return (rows.results ?? []).map((r) => r.recipient_id);
}

export async function pushNotificationReadSyncForUsers(
  env: Pick<Bindings, 'DB' | 'USER_REALTIME'>,
  userIds: string[]
): Promise<void> {
  await Promise.all(
    userIds.map(async (uid) => {
      const unreadByType = await getNotificationsUnreadByType(env.DB, uid);
      await pushUserEvent(env, uid, {
        type: 'notification:read',
        unreadCount: sumUnreadByType(unreadByType),
        unreadByType,
      });
    })
  );
}
