import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import { pushUserEvent, type SharedPostSummary } from '../lib/realtime';
import { escapeSqlLike, makeContentPreview } from '../lib/validation';

export async function getMessagesUnreadCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS cnt FROM direct_messages WHERE receiver_id = ? AND is_read = 0')
    .bind(userId)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

interface PeerRow {
  id: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
}

interface ShareRecipientRow {
  id: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
  is_official: number;
  official_badge: string;
  is_following: number;
  is_follower: number;
  last_dm_at: string | null;
}

interface DmConversationRow {
  id: string;
  conversation_key: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  shared_post_id: string | null;
  is_read: number;
  created_at: string;
}

interface DmThreadRow {
  id: string;
  conversation_key: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: number;
  created_at: string;
  shared_post_id: string | null;
  post_exists_id: string | null;
  post_content: string | null;
  post_image_url: string | null;
  post_created_at: string | null;
  post_author_id: string | null;
  post_author_nickname: string | null;
  post_author_avatar_seed: string | null;
  post_author_avatar_url: string | null;
  post_author_is_official: number | null;
  post_author_official_badge: string | null;
}

export function buildConversationKey(userA: string, userB: string): string {
  return userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
}

function serializeSharedPost(row: DmThreadRow): SharedPostSummary | null {
  if (!row.shared_post_id) return null;
  if (!row.post_exists_id || !row.post_author_id) {
    return {
      id: row.shared_post_id,
      unavailable: true,
      contentPreview: '',
      imageUrl: '',
      author: null,
      createdAt: null,
    };
  }

  const isOfficial = Boolean(row.post_author_is_official);
  return {
    id: row.shared_post_id,
    unavailable: false,
    contentPreview: makeContentPreview(row.post_content ?? '', 140),
    imageUrl: row.post_image_url ?? '',
    author: {
      id: row.post_author_id,
      nickname: row.post_author_nickname ?? '',
      avatarSeed: row.post_author_avatar_seed ?? '',
      avatarUrl: row.post_author_avatar_url ?? '',
      isOfficial,
      ...(isOfficial ? { officialBadge: row.post_author_official_badge || '官方' } : {}),
    },
    createdAt: row.post_created_at ?? null,
  };
}

export const messageRoutes = new Hono<AppEnv>();

messageRoutes.get('/share-recipients', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const q = (c.req.query('q') || '').trim().slice(0, 30);
  const limitRaw = c.req.query('limit');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 15;

  if (limitRaw === '' || !Number.isInteger(limit) || limit < 1 || limit > 30) {
    return c.json({ error: 'limit 参数需为 1 到 30 的整数' }, 400);
  }

  const whereParts = ['u.id != ?'];
  const whereBindings: (string | number)[] = [user.id];

  if (q) {
    const likePattern = `%${escapeSqlLike(q)}%`;
    whereParts.push("u.nickname LIKE ? ESCAPE '\\'");
    whereBindings.push(likePattern);
  }

  const prefixPattern = q ? `${escapeSqlLike(q.toLowerCase())}%` : '';
  const orderPrefixExpr = q
    ? "CASE WHEN LOWER(u.nickname) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END ASC,"
    : '';
  const orderBindings = q ? [prefixPattern] : [];

  const rows = await c.env.DB.prepare(
    `SELECT
       u.id,
       u.nickname,
       u.avatar_seed,
       COALESCE(up.avatar_url, '') AS avatar_url,
       COALESCE(up.bio, '') AS bio,
       CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
       COALESCE(oa.badge_label, '') AS official_badge,
       CASE WHEN uf_out.following_id IS NOT NULL THEN 1 ELSE 0 END AS is_following,
       CASE WHEN uf_in.follower_id IS NOT NULL THEN 1 ELSE 0 END AS is_follower,
       (
         SELECT MAX(dm.created_at)
         FROM direct_messages dm
         WHERE (dm.sender_id = ? AND dm.receiver_id = u.id)
            OR (dm.sender_id = u.id AND dm.receiver_id = ?)
       ) AS last_dm_at
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN official_accounts oa ON oa.user_id = u.id
     LEFT JOIN user_follows uf_out ON uf_out.follower_id = ? AND uf_out.following_id = u.id
     LEFT JOIN user_follows uf_in ON uf_in.follower_id = u.id AND uf_in.following_id = ?
     WHERE ${whereParts.join(' AND ')}
     ORDER BY
       ${orderPrefixExpr}
       CASE WHEN last_dm_at IS NOT NULL THEN 1 ELSE 0 END DESC,
       CASE WHEN uf_out.following_id IS NOT NULL AND uf_in.follower_id IS NOT NULL THEN 1 ELSE 0 END DESC,
       is_following DESC,
       is_follower DESC,
       last_dm_at DESC,
       u.created_at DESC
     LIMIT ?`
  )
    .bind(user.id, user.id, user.id, user.id, ...whereBindings, ...orderBindings, limit)
    .all<ShareRecipientRow>();

  return c.json({
    recipients: (rows.results ?? []).map((r) => {
      const isOfficial = Boolean(r.is_official);
      const isFollowing = Boolean(r.is_following);
      const isFollower = Boolean(r.is_follower);
      return {
        id: r.id,
        nickname: r.nickname,
        avatarSeed: r.avatar_seed,
        avatarUrl: r.avatar_url ?? '',
        bio: r.bio ?? '',
        isOfficial,
        ...(isOfficial ? { officialBadge: r.official_badge || '官方' } : {}),
        isFollowing,
        isFollower,
        isMutualFollow: isFollowing && isFollower,
        hasConversation: Boolean(r.last_dm_at),
      };
    }),
  });
});

messageRoutes.get('/conversations', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const allMsgs = await c.env.DB.prepare(
    `SELECT dm.id, dm.conversation_key, dm.sender_id, dm.receiver_id, dm.content,
            dmps.post_id AS shared_post_id,
            dm.is_read, dm.created_at
     FROM direct_messages dm
     LEFT JOIN direct_message_post_shares dmps ON dmps.message_id = dm.id
     WHERE dm.sender_id = ? OR dm.receiver_id = ?
     ORDER BY dm.created_at DESC`
  )
    .bind(user.id, user.id)
    .all<DmConversationRow>();

  const convMap = new Map<
    string,
    {
      peerId: string;
      lastMessage: {
        id: string;
        senderId: string;
        content: string;
        sharedPostId: string | null;
        createdAt: string;
      };
      unreadCount: number;
    }
  >();

  let totalUnread = 0;
  for (const row of allMsgs.results ?? []) {
    const peerId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
    const isUnreadForMe = row.receiver_id === user.id && row.is_read === 0;
    if (isUnreadForMe) {
      totalUnread += 1;
    }

    const existing = convMap.get(row.conversation_key);
    if (!existing) {
      convMap.set(row.conversation_key, {
        peerId,
        lastMessage: {
          id: row.id,
          senderId: row.sender_id,
          content: row.content,
          sharedPostId: row.shared_post_id ?? null,
          createdAt: row.created_at,
        },
        unreadCount: isUnreadForMe ? 1 : 0,
      });
    } else if (isUnreadForMe) {
      existing.unreadCount += 1;
    }
  }

  const peerIds = Array.from(new Set(Array.from(convMap.values()).map((v) => v.peerId)));
  const peerMap = new Map<string, PeerRow>();
  if (peerIds.length > 0) {
    const placeholders = peerIds.map(() => '?').join(', ');
    const peerRows = await c.env.DB.prepare(
      `SELECT u.id, u.nickname, u.avatar_seed,
              COALESCE(up.avatar_url, '') AS avatar_url,
              COALESCE(up.bio, '') AS bio
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id IN (${placeholders})`
    )
      .bind(...peerIds)
      .all<PeerRow>();
    for (const p of peerRows.results ?? []) {
      peerMap.set(p.id, p);
    }
  }

  const conversations = Array.from(convMap.values())
    .map((entry) => {
      const peer = peerMap.get(entry.peerId);
      if (!peer) return null;
      return {
        peer: {
          id: peer.id,
          nickname: peer.nickname,
          avatarSeed: peer.avatar_seed,
          avatarUrl: peer.avatar_url ?? '',
          bio: peer.bio ?? '',
        },
        lastMessage: entry.lastMessage,
        unreadCount: entry.unreadCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return c.json({
    conversations,
    totalUnread,
  });
});

messageRoutes.get('/with/:peerId', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const peerId = c.req.param('peerId');
  if (peerId === user.id) {
    return c.json({ error: '不能与自己建立私信会话' }, 400);
  }

  const limitRaw = c.req.query('limit');
  const offsetRaw = c.req.query('offset');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 50;
  const offset = offsetRaw !== undefined ? Number(offsetRaw) : 0;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return c.json({ error: '分页参数无效' }, 400);
  }

  const peer = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.avatar_seed,
            COALESCE(up.avatar_url, '') AS avatar_url,
            COALESCE(up.bio, '') AS bio
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`
  )
    .bind(peerId)
    .first<PeerRow>();

  if (!peer) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const convKey = buildConversationKey(user.id, peerId);

  // Mark incoming messages from peer as read
  const readRes = await c.env.DB.prepare(
    'UPDATE direct_messages SET is_read = 1 WHERE conversation_key = ? AND receiver_id = ? AND is_read = 0'
  )
    .bind(convKey, user.id)
    .run();

  if (readRes.meta.changes && readRes.meta.changes > 0) {
    const totalUnread = await getMessagesUnreadCount(c.env.DB, user.id);
    await pushUserEvent(c.env, user.id, {
      type: 'dm:read',
      peerId,
      totalUnread,
    });
  }

  const rows = await c.env.DB.prepare(
    `SELECT dm.id, dm.conversation_key, dm.sender_id, dm.receiver_id, dm.content, dm.is_read, dm.created_at,
            dmps.post_id AS shared_post_id,
            p.id AS post_exists_id,
            p.content AS post_content,
            p.image_url AS post_image_url,
            p.created_at AS post_created_at,
            pu.id AS post_author_id,
            pu.nickname AS post_author_nickname,
            pu.avatar_seed AS post_author_avatar_seed,
            COALESCE(pup.avatar_url, '') AS post_author_avatar_url,
            CASE WHEN poa.user_id IS NOT NULL THEN 1 ELSE 0 END AS post_author_is_official,
            COALESCE(poa.badge_label, '') AS post_author_official_badge
     FROM direct_messages dm
     LEFT JOIN direct_message_post_shares dmps ON dmps.message_id = dm.id
     LEFT JOIN posts p ON p.id = dmps.post_id
     LEFT JOIN users pu ON pu.id = p.author_id
     LEFT JOIN user_profiles pup ON pup.user_id = pu.id
     LEFT JOIN official_accounts poa ON poa.user_id = pu.id
     WHERE dm.conversation_key = ?
     ORDER BY dm.created_at ASC
     LIMIT ? OFFSET ?`
  )
    .bind(convKey, limit, offset)
    .all<DmThreadRow>();

  return c.json({
    peer: {
      id: peer.id,
      nickname: peer.nickname,
      avatarSeed: peer.avatar_seed,
      avatarUrl: peer.avatar_url ?? '',
      bio: peer.bio ?? '',
    },
    messages: (rows.results ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      content: m.content,
      sharedPost: serializeSharedPost(m),
      isRead: Boolean(m.is_read),
      createdAt: m.created_at,
    })),
  });
});

messageRoutes.post('/with/:peerId/read', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const peerId = c.req.param('peerId');
  if (peerId === user.id) {
    return c.json({ error: '不能与自己建立私信会话' }, 400);
  }

  const peer = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(peerId)
    .first<{ id: string }>();
  if (!peer) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const convKey = buildConversationKey(user.id, peerId);
  await c.env.DB.prepare(
    'UPDATE direct_messages SET is_read = 1 WHERE conversation_key = ? AND receiver_id = ? AND is_read = 0'
  )
    .bind(convKey, user.id)
    .run();

  const totalUnread = await getMessagesUnreadCount(c.env.DB, user.id);
  await pushUserEvent(c.env, user.id, {
    type: 'dm:read',
    peerId,
    totalUnread,
  });

  return c.json({ ok: true, totalUnread });
});

messageRoutes.post('/with/:peerId', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再发送私信' }, 401);
  }

  const peerId = c.req.param('peerId');
  if (peerId === user.id) {
    return c.json({ error: '不能给自己发送私信' }, 400);
  }

  const peer = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(peerId)
    .first<{ id: string }>();
  if (!peer) {
    return c.json({ error: '接收用户不存在' }, 404);
  }

  const body = await c.req.json<{ content?: unknown }>().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (content.length < 1 || content.length > 2000) {
    return c.json({ error: '私信内容长度需在 1 到 2000 个字符之间' }, 400);
  }

  const convKey = buildConversationKey(user.id, peerId);
  const msgId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO direct_messages (id, conversation_key, sender_id, receiver_id, content, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(msgId, convKey, user.id, peerId, content, nowIso)
    .run();

  const messagePayload = {
    id: msgId,
    conversationKey: convKey,
    senderId: user.id,
    receiverId: peerId,
    content,
    sharedPost: null,
    isRead: false,
    createdAt: nowIso,
  };

  const senderPayload = {
    id: user.id,
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  };

  const [receiverUnread, senderUnread] = await Promise.all([
    getMessagesUnreadCount(c.env.DB, peerId),
    getMessagesUnreadCount(c.env.DB, user.id),
  ]);

  await Promise.all([
    pushUserEvent(c.env, peerId, {
      type: 'dm:new',
      message: messagePayload,
      sender: senderPayload,
      receiverId: peerId,
      totalUnread: receiverUnread,
    }),
    pushUserEvent(c.env, user.id, {
      type: 'dm:new',
      message: messagePayload,
      sender: senderPayload,
      receiverId: peerId,
      totalUnread: senderUnread,
    }),
  ]);

  return c.json(
    {
      ok: true,
      message: messagePayload,
    },
    201
  );
});
