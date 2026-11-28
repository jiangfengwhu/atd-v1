import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import { ensureAdminConfig } from '../lib/admin-config';
import {
  escapeSqlLike,
  isValidImageUrl,
  makeContentPreview,
  mergePostTags,
  sanitizeTags,
} from '../lib/validation';
import {
  clearUnreadLikeNotification,
  createOrUpdateNotification,
  getUnreadNotificationRecipientsForPost,
  pushNotificationReadSyncForUsers,
} from '../lib/notifications';
import {
  extractMentionTokens,
  fetchMentionsForPostIds,
  resolveMentionedUsers,
  type ResolvedMention,
} from '../lib/mentions';
import {
  OFFICIAL_FEEDBACK_BADGE,
  OFFICIAL_FEEDBACK_HANDLE,
  OFFICIAL_FEEDBACK_NICKNAME,
  OFFICIAL_FEEDBACK_USER_ID,
  ensureOfficialFeedbackAccount,
  isOfficialUserId,
} from '../lib/official';
import {
  fetchFeedbackTicketsForPostIds,
  fetchTicketEventsForCommentIds,
  getFeedbackTicketStatusLabel,
  isValidFeedbackTicketStatus,
  serializeFeedbackTicket,
  type FeedbackTicketSummary,
} from '../lib/feedback-tickets';
import { sha256Hex } from '../lib/crypto';
import { tryPushToAutoDevStudio } from './signals';
import { isValidAdminSession } from './admin';
import { pushUserEvent, type SharedPostSummary } from '../lib/realtime';
import { buildConversationKey, getMessagesUnreadCount } from './messages';

export interface PostRow {
  id: string;
  author_id: string;
  content: string;
  image_url: string;
  tags_json: string;
  likes_count: number;
  comments_count: number;
  views_count?: number | null;
  bookmarks_count?: number | null;
  shares_count?: number | null;
  created_at: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url?: string | null;
  author_is_official?: number | null;
  author_official_badge?: string | null;
  liked_by_me?: number;
  bookmarked_by_me?: number;
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
  author_is_official?: number | null;
  author_official_badge?: string | null;
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
  author_is_official?: number | null;
  author_official_badge?: string | null;
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

export function serializePost(
  row: PostRow,
  mentions: ResolvedMention[] = [],
  feedbackTicket: FeedbackTicketSummary | null = null
) {
  const isOfficial = Boolean(row.author_is_official);
  return {
    id: row.id,
    content: row.content,
    imageUrl: row.image_url,
    tags: parseTagsJson(row.tags_json),
    mentions,
    feedbackTicket,
    likesCount: Number(row.likes_count),
    commentsCount: Number(row.comments_count),
    viewsCount: Number(row.views_count ?? 0),
    bookmarksCount: Number(row.bookmarks_count ?? 0),
    sharesCount: Number(row.shares_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
    bookmarkedByMe: Boolean(row.bookmarked_by_me),
    author: {
      id: row.author_id,
      nickname: row.author_nickname,
      avatarSeed: row.author_avatar_seed,
      avatarUrl: row.author_avatar_url ?? '',
      isOfficial,
      ...(isOfficial ? { officialBadge: row.author_official_badge || '官方' } : {}),
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
    (sort !== 'latest' && sort !== 'hot' && sort !== 'following')
  ) {
    return c.json({ error: '分页或排序参数无效' }, 400);
  }

  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (sort === 'following' && !user) {
    return c.json({ error: '请先登录后再查看我的关注动态' }, 401);
  }

  const config = await ensureAdminConfig(c.env.DB);

  const conditions: string[] = [];
  const filterParams: (string | number)[] = [];

  if (sort === 'following' && user) {
    conditions.push(
      'EXISTS (SELECT 1 FROM user_follows uf WHERE uf.follower_id = ? AND uf.following_id = p.author_id)'
    );
    filterParams.push(user.id);
  }

  if (q) {
    const pattern = `%${escapeSqlLike(q)}%`;
    conditions.push("(p.content LIKE ? ESCAPE '\\' OR p.tags_json LIKE ? ESCAPE '\\')");
    filterParams.push(pattern, pattern);
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
    ? `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              COALESCE(pm.views_count, 0) AS views_count,
              COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
              COALESCE(pm.shares_count, 0) AS shares_count,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me,
              CASE WHEN pb.user_id IS NOT NULL THEN 1 ELSE 0 END AS bookmarked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       LEFT JOIN post_metrics pm ON pm.post_id = p.id
       LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?
       LEFT JOIN post_bookmarks pb ON pb.post_id = p.id AND pb.user_id = ?
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`
    : `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              COALESCE(pm.views_count, 0) AS views_count,
              COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
              COALESCE(pm.shares_count, 0) AS shares_count,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              0 AS liked_by_me,
              0 AS bookmarked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       LEFT JOIN post_metrics pm ON pm.post_id = p.id
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`;

  const listBindings = user
    ? [user.id, user.id, ...filterParams, limit, offset]
    : [...filterParams, limit, offset];

  const rows = await c.env.DB.prepare(listQuery)
    .bind(...listBindings)
    .all<PostRow>();

  const postResults = rows.results ?? [];
  const postIds = postResults.map((r) => r.id);
  const [mentionsMap, ticketsMap] = await Promise.all([
    fetchMentionsForPostIds(c.env.DB, postIds),
    fetchFeedbackTicketsForPostIds(c.env.DB, postIds),
  ]);

  return c.json({
    posts: postResults.map((row) =>
      serializePost(row, mentionsMap.get(row.id) ?? [], ticketsMap.get(row.id) ?? null)
    ),
    total: Number(countRow?.total ?? 0),
    siteName: config.site_name,
  });
});

postRoutes.post('/', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再发布动态' }, 401);
  }

  const body = await c.req
    .json<{ content?: unknown; imageUrl?: unknown; tags?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const extraTags = sanitizeTags(body.tags);

  if (content.length < 1 || content.length > 5000) {
    return c.json({ error: '正文长度需在 1 到 5000 个字符之间' }, 400);
  }
  if (!isValidImageUrl(imageUrl)) {
    return c.json({ error: '图片链接仅支持站内上传路径或 http/https 地址' }, 400);
  }
  if (extraTags === null) {
    return c.json({ error: '话题标签格式无效' }, 400);
  }

  const tags = mergePostTags(content, extraTags);
  const mentionTokens = extractMentionTokens(content);
  const mentions = await resolveMentionedUsers(c.env.DB, mentionTokens);
  const authorIsOfficial = await isOfficialUserId(c.env.DB, user.id);
  const postId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const officialFeedbackMention = mentions.find(
    (m) => m.isOfficial && m.isFeedbackAccount !== false && m.userId !== user.id
  );

  let createdTicket: FeedbackTicketSummary | null = null;
  let feedbackQueuePush: {
    rowId: string;
    payload: Record<string, unknown>;
  } | null = null;

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO posts (id, author_id, content, image_url, tags_json, likes_count, comments_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).bind(postId, user.id, content, imageUrl, JSON.stringify(tags), nowIso, nowIso),
    ...mentions.map((m) =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO post_mentions (post_id, mentioned_user_id, matched_text, created_at)
         VALUES (?, ?, ?, ?)`
      ).bind(postId, m.userId, m.matchedText, nowIso)
    ),
  ];

  if (officialFeedbackMention) {
    const feedbackQueueId = `fb_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const userHash = (await sha256Hex(`user:${user.id}`)).slice(0, 24);
    const feedbackContent = content.slice(0, 1500);
    const pageRoute = `/posts/${postId}`;
    const metadata = {
      sourceApp: 'atd-v1-community',
      source: 'post_mention',
      postId,
      ticketId,
      feedbackQueueId,
      authorId: user.id,
      authorNickname: user.nickname,
    };

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO autodev_feedback_queue
          (id, content, category, page_route, user_hash, app_version, metadata_json, synced, created_at)
         VALUES (?, ?, 'feature', ?, ?, '1.0.0', ?, 0, ?)`
      ).bind(
        feedbackQueueId,
        feedbackContent,
        pageRoute,
        userHash,
        JSON.stringify(metadata),
        nowIso
      ),
      c.env.DB.prepare(
        `INSERT INTO feedback_tickets
          (id, post_id, author_id, official_user_id, feedback_queue_id, content, status, status_note, last_reply_comment_id, updated_by_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', '', NULL, 0, ?, ?)`
      ).bind(
        ticketId,
        postId,
        user.id,
        officialFeedbackMention.userId,
        feedbackQueueId,
        feedbackContent,
        nowIso,
        nowIso
      )
    );

    createdTicket = serializeFeedbackTicket({
      id: ticketId,
      post_id: postId,
      feedback_queue_id: feedbackQueueId,
      status: 'pending',
      status_note: '',
      updated_by_admin: 0,
      created_at: nowIso,
      updated_at: nowIso,
    });

    feedbackQueuePush = {
      rowId: feedbackQueueId,
      payload: {
        content: feedbackContent,
        category: 'feature',
        pageRoute,
        userId: userHash,
        appVersion: '1.0.0',
        metadata,
      },
    };
  }

  await c.env.DB.batch(statements);

  if (feedbackQueuePush) {
    try {
      c.executionCtx.waitUntil(
        tryPushToAutoDevStudio({
          env: c.env,
          endpointPath: '/api/ingest/feedback',
          table: 'autodev_feedback_queue',
          rowId: feedbackQueuePush.rowId,
          payload: feedbackQueuePush.payload,
        })
      );
    } catch {
      // executionCtx unavailable in test environments
    }
  }

  return c.json(
    {
      ok: true,
      post: {
        id: postId,
        content,
        imageUrl,
        tags,
        mentions,
        feedbackTicket: createdTicket,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        bookmarksCount: 0,
        sharesCount: 0,
        likedByMe: false,
        bookmarkedByMe: false,
        author: {
          id: user.id,
          nickname: user.nickname,
          avatarSeed: user.avatarSeed,
          avatarUrl: user.avatarUrl,
          isOfficial: authorIsOfficial,
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
    ? `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              COALESCE(pm.views_count, 0) AS views_count,
              COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
              COALESCE(pm.shares_count, 0) AS shares_count,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me,
              CASE WHEN pb.user_id IS NOT NULL THEN 1 ELSE 0 END AS bookmarked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       LEFT JOIN post_metrics pm ON pm.post_id = p.id
       LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?
       LEFT JOIN post_bookmarks pb ON pb.post_id = p.id AND pb.user_id = ?
       WHERE p.id = ?
       LIMIT 1`
    : `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              COALESCE(pm.views_count, 0) AS views_count,
              COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
              COALESCE(pm.shares_count, 0) AS shares_count,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              0 AS liked_by_me,
              0 AS bookmarked_by_me
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       LEFT JOIN post_metrics pm ON pm.post_id = p.id
       WHERE p.id = ?
       LIMIT 1`;

  const row = user
    ? await c.env.DB.prepare(postQuery).bind(user.id, user.id, postId).first<PostRow>()
    : await c.env.DB.prepare(postQuery).bind(postId).first<PostRow>();

  if (!row) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const [commentRows, replyRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.post_id, c.content, c.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge
       FROM comments c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`
    )
      .bind(postId)
      .all<CommentRow>(),
    c.env.DB.prepare(
      `SELECT r.id, r.comment_id, r.post_id, r.content, r.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              r.reply_to_user_id,
              ru.nickname AS reply_to_nickname
       FROM comment_replies r
       JOIN users u ON u.id = r.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
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
      author: {
        id: string;
        nickname: string;
        avatarSeed: string;
        avatarUrl: string;
        isOfficial: boolean;
        officialBadge?: string;
      };
      replyToUser: { id: string; nickname: string } | null;
      createdAt: string;
    }>
  >();

  for (const r of replyRows.results ?? []) {
    const isOfficial = Boolean(r.author_is_official);
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
        isOfficial,
        ...(isOfficial ? { officialBadge: r.author_official_badge || '官方' } : {}),
      },
      replyToUser:
        r.reply_to_user_id && r.reply_to_nickname
          ? { id: r.reply_to_user_id, nickname: r.reply_to_nickname }
          : null,
      createdAt: r.created_at,
    });
    repliesByComment.set(r.comment_id, list);
  }

  const commentList = commentRows.results ?? [];
  const [mentionsMap, ticketsMap, ticketEventsMap] = await Promise.all([
    fetchMentionsForPostIds(c.env.DB, [postId]),
    fetchFeedbackTicketsForPostIds(c.env.DB, [postId]),
    fetchTicketEventsForCommentIds(
      c.env.DB,
      commentList.map((cm) => cm.id)
    ),
  ]);

  return c.json({
    post: serializePost(row, mentionsMap.get(postId) ?? [], ticketsMap.get(postId) ?? null),
    comments: commentList.map((cm) => {
      const isOfficial = Boolean(cm.author_is_official);
      return {
        id: cm.id,
        content: cm.content,
        author: {
          id: cm.author_id,
          nickname: cm.author_nickname,
          avatarSeed: cm.author_avatar_seed,
          avatarUrl: cm.author_avatar_url ?? '',
          isOfficial,
          ...(isOfficial ? { officialBadge: cm.author_official_badge || '官方' } : {}),
        },
        ticketEvent: ticketEventsMap.get(cm.id) ?? null,
        replies: repliesByComment.get(cm.id) ?? [],
        createdAt: cm.created_at,
      };
    }),
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

postRoutes.post('/:id/like', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再点赞' }, 401);
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id, content FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string; author_id: string; content: string }>();

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
        contentPreview: makeContentPreview(post.content, 80),
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

postRoutes.post('/:id/view', async (c) => {
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO post_metrics (post_id, views_count, bookmarks_count, shares_count, updated_at)
     VALUES (?, 1, 0, 0, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       views_count = post_metrics.views_count + 1,
       updated_at = excluded.updated_at`
  )
    .bind(postId, nowIso)
    .run();

  const metrics = await c.env.DB.prepare(
    'SELECT views_count FROM post_metrics WHERE post_id = ? LIMIT 1'
  )
    .bind(postId)
    .first<{ views_count: number }>();

  return c.json({
    ok: true,
    viewsCount: Number(metrics?.views_count ?? 1),
  });
});

postRoutes.post('/:id/bookmark', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再收藏' }, 401);
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 AS ok FROM post_bookmarks WHERE post_id = ? AND user_id = ? LIMIT 1'
  )
    .bind(postId, user.id)
    .first<{ ok: number }>();

  const nowIso = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare('DELETE FROM post_bookmarks WHERE post_id = ? AND user_id = ?')
      .bind(postId, user.id)
      .run();
  } else {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO post_bookmarks (post_id, user_id, created_at) VALUES (?, ?, ?)'
    )
      .bind(postId, user.id, nowIso)
      .run();
  }

  const [countRow, mineRow] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM post_bookmarks WHERE post_id = ?')
      .bind(postId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare(
      'SELECT 1 AS ok FROM post_bookmarks WHERE post_id = ? AND user_id = ? LIMIT 1'
    )
      .bind(postId, user.id)
      .first<{ ok: number }>(),
  ]);

  const bookmarksCount = Math.max(0, Number(countRow?.cnt ?? 0));
  await c.env.DB.prepare(
    `INSERT INTO post_metrics (post_id, views_count, bookmarks_count, shares_count, updated_at)
     VALUES (?, 0, ?, 0, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       bookmarks_count = excluded.bookmarks_count,
       updated_at = excluded.updated_at`
  )
    .bind(postId, bookmarksCount, nowIso)
    .run();

  return c.json({
    ok: true,
    bookmarked: Boolean(mineRow?.ok),
    bookmarksCount,
  });
});

const VALID_SHARE_CHANNELS = new Set(['copy_link', 'copy_text', 'external'] as const);
type ShareChannel = 'copy_link' | 'copy_text' | 'external';

postRoutes.post('/:id/share', async (c) => {
  const rawBody = await c.req.text().catch(() => '');
  let channel: ShareChannel = 'copy_link';
  if (rawBody.trim().length > 0) {
    let parsed: { channel?: unknown } | null = null;
    try {
      parsed = JSON.parse(rawBody) as { channel?: unknown };
    } catch {
      return c.json({ error: '请求格式错误' }, 400);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return c.json({ error: '请求格式错误' }, 400);
    }
    if (parsed.channel !== undefined) {
      if (
        typeof parsed.channel !== 'string' ||
        !VALID_SHARE_CHANNELS.has(parsed.channel as ShareChannel)
      ) {
        return c.json({ error: '分享渠道参数无效' }, 400);
      }
      channel = parsed.channel as ShareChannel;
    }
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO post_metrics (post_id, views_count, bookmarks_count, shares_count, updated_at)
     VALUES (?, 0, 0, 1, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       shares_count = post_metrics.shares_count + 1,
       updated_at = excluded.updated_at`
  )
    .bind(postId, nowIso)
    .run();

  const metrics = await c.env.DB.prepare(
    'SELECT shares_count FROM post_metrics WHERE post_id = ? LIMIT 1'
  )
    .bind(postId)
    .first<{ shares_count: number }>();

  return c.json({
    ok: true,
    sharesCount: Number(metrics?.shares_count ?? 1),
    sharePath: `/posts/${postId}`,
    channel,
  });
});

postRoutes.post('/:id/share-dm', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再通过私信分享' }, 401);
  }

  const body = await c.req
    .json<{ recipientIds?: unknown; note?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  if (!Array.isArray(body.recipientIds) || body.recipientIds.length === 0) {
    return c.json({ error: '请至少选择一位好友' }, 400);
  }

  const uniqueRecipients: string[] = [];
  const seenRecipients = new Set<string>();
  for (const rawId of body.recipientIds) {
    if (typeof rawId !== 'string' || !rawId.trim()) {
      return c.json({ error: '接收人参数无效' }, 400);
    }
    const cleanId = rawId.trim();
    if (!seenRecipients.has(cleanId)) {
      seenRecipients.add(cleanId);
      uniqueRecipients.push(cleanId);
    }
  }

  if (uniqueRecipients.length < 1 || uniqueRecipients.length > 10) {
    return c.json({ error: '单次最多可分享给 10 位好友' }, 400);
  }

  if (seenRecipients.has(user.id)) {
    return c.json({ error: '不能将动态私信分享给自己' }, 400);
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return c.json({ error: '附言格式无效' }, 400);
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) {
    return c.json({ error: '附言长度不能超过 1000 个字符' }, 400);
  }

  const postId = c.req.param('id');
  const recipientPlaceholders = uniqueRecipients.map(() => '?').join(', ');

  const [postRow, recipientRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT p.id, p.content, p.image_url, p.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       WHERE p.id = ?
       LIMIT 1`
    )
      .bind(postId)
      .first<{
        id: string;
        content: string;
        image_url: string;
        created_at: string;
        author_id: string;
        author_nickname: string;
        author_avatar_seed: string;
        author_avatar_url: string;
        author_is_official: number;
        author_official_badge: string;
      }>(),
    c.env.DB.prepare(`SELECT id FROM users WHERE id IN (${recipientPlaceholders})`)
      .bind(...uniqueRecipients)
      .all<{ id: string }>(),
  ]);

  if (!postRow) {
    return c.json({ error: '动态不存在或已被删除' }, 404);
  }

  const foundIds = new Set((recipientRows.results ?? []).map((r) => r.id));
  if (foundIds.size !== uniqueRecipients.length) {
    return c.json({ error: '部分接收好友不存在' }, 404);
  }

  const authorIsOfficial = Boolean(postRow.author_is_official);
  const sharedPost: SharedPostSummary = {
    id: postRow.id,
    unavailable: false,
    contentPreview: makeContentPreview(postRow.content, 140),
    imageUrl: postRow.image_url ?? '',
    author: {
      id: postRow.author_id,
      nickname: postRow.author_nickname,
      avatarSeed: postRow.author_avatar_seed,
      avatarUrl: postRow.author_avatar_url ?? '',
      isOfficial: authorIsOfficial,
      ...(authorIsOfficial
        ? { officialBadge: postRow.author_official_badge || '官方' }
        : {}),
    },
    createdAt: postRow.created_at,
  };

  const nowIso = new Date().toISOString();
  const createdMessages: Array<{
    id: string;
    conversationKey: string;
    senderId: string;
    receiverId: string;
    content: string;
    sharedPost: SharedPostSummary;
    isRead: false;
    createdAt: string;
  }> = [];

  const statements = [];
  for (const recipientId of uniqueRecipients) {
    const msgId = crypto.randomUUID();
    const convKey = buildConversationKey(user.id, recipientId);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO direct_messages (id, conversation_key, sender_id, receiver_id, content, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).bind(msgId, convKey, user.id, recipientId, note, nowIso),
      c.env.DB.prepare(
        `INSERT INTO direct_message_post_shares (message_id, post_id, created_at)
         VALUES (?, ?, ?)`
      ).bind(msgId, postId, nowIso)
    );
    createdMessages.push({
      id: msgId,
      conversationKey: convKey,
      senderId: user.id,
      receiverId: recipientId,
      content: note,
      sharedPost,
      isRead: false,
      createdAt: nowIso,
    });
  }

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO post_metrics (post_id, views_count, bookmarks_count, shares_count, updated_at)
       VALUES (?, 0, 0, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         shares_count = post_metrics.shares_count + excluded.shares_count,
         updated_at = excluded.updated_at`
    ).bind(postId, uniqueRecipients.length, nowIso)
  );

  await c.env.DB.batch(statements);

  const metrics = await c.env.DB.prepare(
    'SELECT shares_count FROM post_metrics WHERE post_id = ? LIMIT 1'
  )
    .bind(postId)
    .first<{ shares_count: number }>();

  const senderPayload = {
    id: user.id,
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  };

  const [senderUnread, ...receiverUnreads] = await Promise.all([
    getMessagesUnreadCount(c.env.DB, user.id),
    ...createdMessages.map((m) => getMessagesUnreadCount(c.env.DB, m.receiverId)),
  ]);

  await Promise.all(
    createdMessages.flatMap((msg, idx) => [
      pushUserEvent(c.env, msg.receiverId, {
        type: 'dm:new',
        message: msg,
        sender: senderPayload,
        receiverId: msg.receiverId,
        totalUnread: receiverUnreads[idx] ?? 1,
      }),
      pushUserEvent(c.env, user.id, {
        type: 'dm:new',
        message: msg,
        sender: senderPayload,
        receiverId: msg.receiverId,
        totalUnread: senderUnread,
      }),
    ])
  );

  return c.json(
    {
      ok: true,
      postId,
      sharesCount: Number(metrics?.shares_count ?? createdMessages.length),
      sentCount: createdMessages.length,
      messages: createdMessages,
    },
    201
  );
});

postRoutes.post('/:id/comments', async (c) => {
  const cookieHeader = c.req.header('cookie');
  const [user, isAdmin] = await Promise.all([
    getSessionUser(c.env.DB, cookieHeader),
    isValidAdminSession(c.env.DB, cookieHeader),
  ]);

  const body = await c.req
    .json<{ content?: unknown; ticketStatus?: unknown; asOfficial?: unknown }>()
    .catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const rawTicketStatus =
    typeof body.ticketStatus === 'string' ? body.ticketStatus.trim() : '';
  const hasTicketStatusUpdate = rawTicketStatus.length > 0;

  if (hasTicketStatusUpdate && !isAdmin) {
    return c.json({ error: '仅管理员账号可操作工单状态变更' }, 403);
  }

  if (!user && !(hasTicketStatusUpdate && isAdmin)) {
    return c.json({ error: '请先登录后再发表评论' }, 401);
  }

  if (hasTicketStatusUpdate && !isValidFeedbackTicketStatus(rawTicketStatus)) {
    return c.json({ error: '工单状态参数无效' }, 400);
  }

  const postId = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id, content FROM posts WHERE id = ? LIMIT 1')
    .bind(postId)
    .first<{ id: string; author_id: string; content: string }>();

  if (!post) {
    return c.json({ error: '帖子不存在' }, 404);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (content.length < 1 || content.length > 1000) {
    return c.json({ error: '评论内容长度需在 1 到 1000 个字符之间' }, 400);
  }

  let ticketRow: {
    id: string;
    post_id: string;
    author_id: string;
    feedback_queue_id: string;
    status: string;
    created_at: string;
  } | null = null;

  if (hasTicketStatusUpdate) {
    ticketRow = await c.env.DB.prepare(
      `SELECT id, post_id, author_id, feedback_queue_id, status, created_at
       FROM feedback_tickets
       WHERE post_id = ?
       LIMIT 1`
    )
      .bind(postId)
      .first();

    if (!ticketRow) {
      return c.json({ error: '该动态未关联反馈工单，无法变更工单状态' }, 400);
    }
  }

  const actAsOfficial = Boolean(hasTicketStatusUpdate && (!user || body.asOfficial === true));
  if (actAsOfficial) {
    await ensureOfficialFeedbackAccount(c.env.DB);
  }

  const commentAuthor = actAsOfficial
    ? {
        id: OFFICIAL_FEEDBACK_USER_ID,
        nickname: OFFICIAL_FEEDBACK_NICKNAME,
        avatarSeed: OFFICIAL_FEEDBACK_HANDLE,
        avatarUrl: '',
        isOfficial: true,
        officialBadge: OFFICIAL_FEEDBACK_BADGE,
      }
    : {
        id: user!.id,
        nickname: user!.nickname,
        avatarSeed: user!.avatarSeed,
        avatarUrl: user!.avatarUrl,
        isOfficial: await isOfficialUserId(c.env.DB, user!.id),
      };

  const commentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const statements = [
    c.env.DB.prepare(
      'INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(commentId, postId, commentAuthor.id, content, nowIso),
    c.env.DB.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').bind(
      postId
    ),
  ];

  let ticketEventPayload: {
    ticketId: string;
    fromStatus: string;
    toStatus: string;
    fromStatusLabel: string;
    toStatusLabel: string;
  } | null = null;
  let updatedTicketPayload: FeedbackTicketSummary | null = null;

  if (hasTicketStatusUpdate && ticketRow && isValidFeedbackTicketStatus(rawTicketStatus)) {
    const fromStatus = isValidFeedbackTicketStatus(ticketRow.status)
      ? ticketRow.status
      : 'pending';
    const toStatus = rawTicketStatus;
    const eventId = crypto.randomUUID();

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO comment_ticket_events (id, comment_id, ticket_id, post_id, from_status, to_status, actor_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)`
      ).bind(eventId, commentId, ticketRow.id, postId, fromStatus, toStatus, nowIso),
      c.env.DB.prepare(
        `UPDATE feedback_tickets
         SET status = ?, status_note = ?, last_reply_comment_id = ?, updated_by_admin = 1, updated_at = ?
         WHERE id = ?`
      ).bind(toStatus, content, commentId, nowIso, ticketRow.id)
    );

    ticketEventPayload = {
      ticketId: ticketRow.id,
      fromStatus,
      toStatus,
      fromStatusLabel: getFeedbackTicketStatusLabel(fromStatus),
      toStatusLabel: getFeedbackTicketStatusLabel(toStatus),
    };

    updatedTicketPayload = serializeFeedbackTicket({
      id: ticketRow.id,
      post_id: ticketRow.post_id,
      feedback_queue_id: ticketRow.feedback_queue_id,
      status: toStatus,
      status_note: content,
      updated_by_admin: 1,
      created_at: ticketRow.created_at,
      updated_at: nowIso,
    });
  }

  await c.env.DB.batch(statements);

  const notifPreview = ticketEventPayload
    ? `[工单${ticketEventPayload.toStatusLabel}] ${content}`
    : content;

  await createOrUpdateNotification(c.env, {
    recipientId: post.author_id,
    actorId: commentAuthor.id,
    type: 'comment',
    postId,
    commentId,
    contentPreview: notifPreview,
  });

  return c.json(
    {
      ok: true,
      comment: {
        id: commentId,
        postId,
        content,
        author: commentAuthor,
        ticketEvent: ticketEventPayload,
        replies: [],
        createdAt: nowIso,
      },
      ...(updatedTicketPayload ? { feedbackTicket: updatedTicketPayload } : {}),
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
