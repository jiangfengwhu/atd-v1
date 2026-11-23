import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import { ensureAdminConfig } from '../lib/admin-config';
import { escapeSqlLike, isValidImageUrl, sanitizeTags } from '../lib/validation';
import {
  clearUnreadLikeNotification,
  createOrUpdateNotification,
  getUnreadNotificationRecipientsForPost,
  pushNotificationReadSyncForUsers,
} from '../lib/notifications';

export interface PostRow {
  id: string;
  author_id: string;
  title: string;
  content: string;
  image_url: string;
  tags_json: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url?: string | null;
  liked_by_me?: number;
}

interface CommentRow {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url?: string | null;
}

interface CommentReplyRow {
  id: string;
  comment_id: string;
  post_id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url?: string | null;
  reply_to_user_id: string | null;
  reply_to_nickname: string | null;
}

function parseTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function serializePost(row: PostRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    imageUrl: row.image_url,
    tags: parseTagsJson(row.tags_json),
    likesCount: Number(row.likes_count),
    commentsCount: Number(row.comments_count),
    likedByMe: Boolean(row.liked_by_me),
    author: {
      id: row.author_id,
      nickname: row.author_nickname,
      avatarSeed: row.author_avatar_seed,
      avatarUrl: row.author_avatar_url ?? '',
    },
    createdAt: row.created_at,
  };
}

export const postRoutes = new Hono<AppEnv>();

postRoutes.get('/', async (c) => {
  const q = (c.req.query('q') || '').trim();
  const tag = (c.req.query('tag') || '').trim().replace(/^#+/, '');
  const sort = c.req.query('sort') || 'latest';
  const limitRaw = c.req.query('limit');
  const offsetRaw = c.req.query('offset');

  const limit = limitRaw !== undefined ? Number(limitRaw) : 24;
  const offset = offsetRaw !== undefined ? Number(offsetRaw) : 0;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    (sort !== 'latest' && sort !== 'hot')
  ) {
    return c.json({ error: '分页或排序参数无效' }, 400);
  }

  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  const config = await ensureAdminConfig(c.env.DB);

  const conditions: string[] = [];
  const filterParams: (string | number)[] = [];

  if (q) {
    const pattern = `%${escapeSqlLike(q)}%`;
    conditions.push(
      "(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\' OR p.tags_json LIKE ? ESCAPE '\\')"
    );
    filterParams.push(pattern, pattern, pattern);
  }

  if (tag) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(p.tags_json) WHERE json_each.value = ?)');
    filterParams.push(tag);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderSql =
    sort === 'hot'
      ? 'ORDER BY p.likes_count DESC, p.comments_count DESC, p.created_at DESC'
      : 'ORDER BY p.created_at DESC';

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM posts p ${whereSql}`)
    .bind(...filterParams)
    .first<{ total: number }>();

  const listQuery = user
    ? `SELECT p.id, p.author_id, p.title, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`
    : `SELECT p.id, p.author_id, p.title, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              0 AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`;

  const listBindings = user
    ? [user.id, ...filterParams, limit, offset]
    : [...filterParams, limit, offset];

  const rows = await c.env.DB.prepare(listQuery)
    .bind(...listBindings)
    .all<PostRow>();

  return c.json({
    posts: (rows.results ?? []).map(serializePost),
    total: Number(countRow?.total ?? 0),
    siteName: config.site_name,
  });
});

postRoutes.post('/', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再发布图文' }, 401);
  }

  const body = await c.req
    .json<{ title?: unknown; content?: unknown; imageUrl?: unknown; tags?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const tags = sanitizeTags(body.tags);

  if (title.length < 1 || title.length > 120) {
    return c.json({ error: '标题长度需在 1 到 120 个字符之间' }, 400);
  }
  if (content.length < 1 || content.length > 5000) {
    return c.json({ error: '正文长度需在 1 到 5000 个字符之间' }, 400);
  }
  if (!isValidImageUrl(imageUrl)) {
    return c.json({ error: '图片链接仅支持站内上传路径或 http/https 地址' }, 400);
  }
  if (tags === null) {
    return c.json({ error: '话题标签格式无效' }, 400);
  }

  const postId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO posts (id, author_id, title, content, image_url, tags_json, likes_count, comments_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  )
    .bind(postId, user.id, title, content, imageUrl, JSON.stringify(tags), nowIso, nowIso)
    .run();

  return c.json(
    {
      ok: true,
      post: {
        id: postId,
        title,
        content,
        imageUrl,
        tags,
        likesCount: 0,
        commentsCount: 0,
        likedByMe: false,
        author: {
          id: user.id,
          nickname: user.nickname,
          avatarSeed: user.avatarSeed,
          avatarUrl: user.avatarUrl,
        },
        createdAt: nowIso,
      },
    },
    201
  );
});

postRoutes.get('/:id', async (c) => {
  const postId = c.req.param('id');
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));

  const postQuery = user
    ? `SELECT p.id, p.author_id, p.title, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?
       WHERE p.id = ?
       LIMIT 1`
    : `SELECT p.id, p.author_id, p.title, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              0 AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE p.id = ?
       LIMIT 1`;

  const row = user
    ? await c.env.DB.prepare(postQuery).bind(user.id, postId).first<PostRow>()
    : await c.env.DB.prepare(postQuery).bind(postId).first<PostRow>();

  if (!row) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const [commentRows, replyRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.post_id, c.content, c.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url
       FROM comments c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`
    )
      .bind(postId)
      .all<CommentRow>(),
    c.env.DB.prepare(
      `SELECT r.id, r.comment_id, r.post_id, r.content, r.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              r.reply_to_user_id,
              ru.nickname AS reply_to_nickname
       FROM comment_replies r
       JOIN users u ON u.id = r.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN users ru ON ru.id = r.reply_to_user_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC`
    )
      .bind(postId)
      .all<CommentReplyRow>(),
  ]);

  const repliesByComment = new Map<
    string,
    Array<{
      id: string;
      commentId: string;
      postId: string;
      content: string;
      author: { id: string; nickname: string; avatarSeed: string; avatarUrl: string };
      replyToUser: { id: string; nickname: string } | null;
      createdAt: string;
    }>
  >();

  for (const r of replyRows.results ?? []) {
    const list = repliesByComment.get(r.comment_id) ?? [];
    list.push({
      id: r.id,
      commentId: r.comment_id,
      postId: r.post_id,
      content: r.content,
      author: {
        id: r.author_id,
        nickname: r.author_nickname,
        avatarSeed: r.author_avatar_seed,
        avatarUrl: r.author_avatar_url ?? '',
      },
      replyToUser:
        r.reply_to_user_id && r.reply_to_nickname
          ? { id: r.reply_to_user_id, nickname: r.reply_to_nickname }
          : null,
      createdAt: r.created_at,
    });
    repliesByComment.set(r.comment_id, list);
  }

  return c.json({
    post: serializePost(row),
    comments: (commentRows.results ?? []).map((cm) => ({
      id: cm.id,
      content: cm.content,
      author: {
        id: cm.author_id,
        nickname: cm.author_nickname,
        avatarSeed: cm.author_avatar_seed,
        avatarUrl: cm.author_avatar_url ?? '',
      },
      replies: repliesByComment.get(cm.id) ?? [],
      createdAt: cm.created_at,
    })),
  });
});

postRoutes.delete('/:id', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const postId = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id, author_id FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string; author_id: string }>();

  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404);
  }
  if (existing.author_id !== user.id) {
    return c.json({ error: '无权删除他人发布的帖子' }, 403);
  }

  const affectedRecipients = await getUnreadNotificationRecipientsForPost(c.env.DB, postId);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM notifications WHERE post_id = ?').bind(postId),
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

postRoutes.post('/:id/like', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再点赞' }, 401);
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id, title FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string; author_id: string; title: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const existingLike = await c.env.DB.prepare(
    'SELECT 1 AS ok FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1'
  )
    .bind(postId, user.id)
    .first<{ ok: number }>();

  let liked = false;
  if (existingLike) {
    const delRes = await c.env.DB.prepare(
      'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?'
    )
      .bind(postId, user.id)
      .run();
    if (delRes.meta.changes && delRes.meta.changes > 0) {
      await c.env.DB.prepare(
        'UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?'
      )
        .bind(postId)
        .run();
      await clearUnreadLikeNotification(c.env, {
        recipientId: post.author_id,
        actorId: user.id,
        postId,
      });
    }
    liked = false;
  } else {
    const insRes = await c.env.DB.prepare(
      'INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)'
    )
      .bind(postId, user.id, new Date().toISOString())
      .run();
    if (insRes.meta.changes && insRes.meta.changes > 0) {
      await c.env.DB.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?')
        .bind(postId)
        .run();
      await createOrUpdateNotification(c.env, {
        recipientId: post.author_id,
        actorId: user.id,
        type: 'like',
        postId,
        contentPreview: post.title,
      });
    }
    liked = true;
  }

  const updated = await c.env.DB.prepare('SELECT likes_count FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ likes_count: number }>();

  return c.json({
    ok: true,
    liked,
    likesCount: Number(updated?.likes_count ?? 0),
  });
});

postRoutes.post('/:id/comments', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再发表评论' }, 401);
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id, title FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string; author_id: string; title: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const body = await c.req.json<{ content?: unknown }>().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (content.length < 1 || content.length > 1000) {
    return c.json({ error: '评论内容长度需在 1 到 1000 个字符之间' }, 400);
  }

  const commentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(commentId, postId, user.id, content, nowIso),
    c.env.DB.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').bind(
      postId
    ),
  ]);

  await createOrUpdateNotification(c.env, {
    recipientId: post.author_id,
    actorId: user.id,
    type: 'comment',
    postId,
    commentId,
    contentPreview: content,
  });

  return c.json(
    {
      ok: true,
      comment: {
        id: commentId,
        postId,
        content,
        author: {
          id: user.id,
          nickname: user.nickname,
          avatarSeed: user.avatarSeed,
          avatarUrl: user.avatarUrl,
        },
        replies: [],
        createdAt: nowIso,
      },
    },
    201
  );
});

postRoutes.post('/:id/comments/:commentId/replies', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再回复评论' }, 401);
  }

  const postId = c.req.param('id');
  const commentId = c.req.param('commentId');

  // Verify the comment exists and belongs to the specified post
  const [post, parentComment] = await Promise.all([
    c.env.DB.prepare('SELECT id, author_id FROM posts WHERE id = ? LIMIT 1')
      .bind(postId)
      .first<{ id: string; author_id: string }>(),
    c.env.DB.prepare('SELECT id, author_id FROM comments WHERE id = ? AND post_id = ? LIMIT 1')
      .bind(commentId, postId)
      .first<{ id: string; author_id: string }>(),
  ]);

  if (!post || !parentComment) {
    return c.json({ error: '帖子或评论不存在' }, 404);
  }

  const body = await c.req
    .json<{ content?: unknown; replyToUserId?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (content.length < 1 || content.length > 1000) {
    return c.json({ error: '回复内容长度需在 1 到 1000 个字符之间' }, 400);
  }

  let replyToUser: { id: string; nickname: string } | null = null;
  if (typeof body.replyToUserId === 'string' && body.replyToUserId.trim()) {
    const targetId = body.replyToUserId.trim();
    const targetRow = await c.env.DB.prepare('SELECT id, nickname FROM users WHERE id = ? LIMIT 1')
      .bind(targetId)
      .first<{ id: string; nickname: string }>();
    if (!targetRow) {
      return c.json({ error: '被回复的用户不存在' }, 404);
    }
    replyToUser = { id: targetRow.id, nickname: targetRow.nickname };
  }

  const replyId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment_replies (id, comment_id, post_id, author_id, reply_to_user_id, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(replyId, commentId, postId, user.id, replyToUser ? replyToUser.id : null, content, nowIso),
    c.env.DB.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').bind(
      postId
    ),
  ]);

  const recipientIds = new Set<string>();
  if (replyToUser?.id) recipientIds.add(replyToUser.id);
  recipientIds.add(parentComment.author_id);
  recipientIds.add(post.author_id);
  recipientIds.delete(user.id);

  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      createOrUpdateNotification(c.env, {
        recipientId,
        actorId: user.id,
        type: 'comment',
        postId,
        commentId,
        contentPreview: content,
      })
    )
  );

  return c.json(
    {
      ok: true,
      reply: {
        id: replyId,
        commentId,
        postId,
        content,
        author: {
          id: user.id,
          nickname: user.nickname,
          avatarSeed: user.avatarSeed,
          avatarUrl: user.avatarUrl,
        },
        replyToUser,
        createdAt: nowIso,
      },
    },
    201
  );
});
