import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import { pushUserEvent } from '../lib/realtime';

async function getMessagesUnreadCount(db: D1Database, userId: string): Promise<number> {
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

interface DmRow {
  id: string;
  conversation_key: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: number;
  created_at: string;
}

function buildConversationKey(userA: string, userB: string): string {
  return userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
}

export const messageRoutes = new Hono<AppEnv>();

messageRoutes.get('/conversations', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const allMsgs = await c.env.DB.prepare(
    `SELECT id, conversation_key, sender_id, receiver_id, content, is_read, created_at
     FROM direct_messages
     WHERE sender_id = ? OR receiver_id = ?
     ORDER BY created_at DESC`
  )
    .bind(user.id, user.id)
    .all<DmRow>();

  const convMap = new Map<
    string,
    {
      peerId: string;
      lastMessage: { id: string; senderId: string; content: string; createdAt: string };
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
    `SELECT id, conversation_key, sender_id, receiver_id, content, is_read, created_at
     FROM direct_messages
     WHERE conversation_key = ?
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`
  )
    .bind(convKey, limit, offset)
    .all<DmRow>();

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
