import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import { serializePost, type PostRow } from './posts';
import {
  clearUnreadFollowNotification,
  createOrUpdateNotification,
} from '../lib/notifications';
import { makeContentPreview, escapeSqlLike } from '../lib/validation';
import { fetchMentionsForPostIds } from '../lib/mentions';
import { ensureOfficialFeedbackAccount } from '../lib/official';

interface UserProfileRow {
  id: string;
  email: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
  is_official: number;
  official_badge: string;
  official_handle: string;
  created_at: string;
}

interface MentionCandidateRow {
  id: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
  is_official: number;
  official_badge: string;
  official_handle: string;
}

interface FollowUserRow {
  id: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
  is_official: number;
  official_badge: string;
  is_following: number;
  followed_at: string;
}

interface CommentActivityRow {
  id: string;
  post_id: string;
  post_content: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url: string;
}

interface ReplyActivityRow {
  id: string;
  comment_id: string;
  post_id: string;
  post_content: string;
  parent_comment_content: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_avatar_seed: string;
  author_avatar_url: string;
  reply_to_user_id: string | null;
  reply_to_nickname: string | null;
}

export const userRoutes = new Hono<AppEnv>();

userRoutes.get('/mention-candidates', async (c) => {
  await ensureOfficialFeedbackAccount(c.env.DB);
  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));

  const q = (c.req.query('q') || '').trim().slice(0, 30);
  const limitRaw = c.req.query('limit');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 8;

  if (limitRaw === '' || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    return c.json({ error: 'limit 参数需为 1 到 20 的整数' }, 400);
  }

  const viewerId = sessionUser?.id ?? '';
  const whereConditions: string[] = [];
  const filterParams: (string | number)[] = [];

  if (q) {
    const likePattern = `%${escapeSqlLike(q)}%`;
    whereConditions.push(
      "(u.nickname LIKE ? ESCAPE '\\' OR COALESCE(oa.handle, '') LIKE ? ESCAPE '\\' OR COALESCE(oa.badge_label, '') LIKE ? ESCAPE '\\')"
    );
    filterParams.push(likePattern, likePattern, likePattern);
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const prefixPattern = q ? `${escapeSqlLike(q.toLowerCase())}%` : '';

  const orderSql = q
    ? `ORDER BY is_official DESC,
                CASE WHEN LOWER(u.nickname) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(oa.handle, '')) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END ASC,
                CASE WHEN ? != '' AND u.id = ? THEN 1 ELSE 0 END ASC,
                (SELECT COUNT(*) FROM user_follows uf WHERE uf.following_id = u.id) DESC,
                u.created_at DESC`
    : `ORDER BY is_official DESC,
                CASE WHEN ? != '' AND u.id = ? THEN 1 ELSE 0 END ASC,
                (SELECT COUNT(*) FROM user_follows uf WHERE uf.following_id = u.id) DESC,
                u.created_at DESC`;

  const orderParams = q ? [prefixPattern, prefixPattern, viewerId, viewerId] : [viewerId, viewerId];

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.avatar_seed,
            COALESCE(up.avatar_url, '') AS avatar_url,
            COALESCE(up.bio, '') AS bio,
            CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
            COALESCE(oa.badge_label, '') AS official_badge,
            COALESCE(oa.handle, '') AS official_handle
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN official_accounts oa ON oa.user_id = u.id
     ${whereSql}
     ${orderSql}
     LIMIT ?`
  )
    .bind(...filterParams, ...orderParams, limit)
    .all<MentionCandidateRow>();

  return c.json({
    users: (rows.results ?? []).map((u) => {
      const isOfficial = Boolean(u.is_official);
      return {
        id: u.id,
        nickname: u.nickname,
        ...(u.official_handle ? { handle: u.official_handle } : {}),
        avatarSeed: u.avatar_seed,
        avatarUrl: u.avatar_url ?? '',
        bio: u.bio ?? '',
        isOfficial,
        ...(isOfficial ? { officialBadge: u.official_badge || '官方' } : {}),
      };
    }),
  });
});

userRoutes.get('/:id', async (c) => {
  await ensureOfficialFeedbackAccount(c.env.DB);
  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));
  const rawId = c.req.param('id');
  if (rawId === 'me' && !sessionUser) {
    return c.json({ error: '请先登录' }, 401);
  }
  const targetId = rawId === 'me' ? sessionUser!.id : rawId;

  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.nickname, u.avatar_seed, u.created_at,
            COALESCE(up.avatar_url, '') AS avatar_url,
            COALESCE(up.bio, '') AS bio,
            CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
            COALESCE(oa.badge_label, '') AS official_badge,
            COALESCE(oa.handle, '') AS official_handle
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN official_accounts oa ON oa.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`
  )
    .bind(targetId)
    .first<UserProfileRow>();

  if (!row) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const isSelf = Boolean(sessionUser && sessionUser.id === row.id);

  const [
    postsRow,
    followingRow,
    followersRow,
    likesRow,
    commentsRow,
    repliesRow,
    bookmarksRow,
    followRel,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM posts WHERE author_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM user_follows WHERE follower_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM user_follows WHERE following_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM post_likes WHERE user_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM comments WHERE author_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt
       FROM comment_replies cr
       JOIN comments cm ON cm.id = cr.comment_id
       WHERE cr.author_id = ? OR cm.author_id = ? OR cr.reply_to_user_id = ?`
    )
      .bind(targetId, targetId, targetId)
      .first<{ cnt: number }>(),
    isSelf
      ? c.env.DB.prepare(
          `SELECT COUNT(*) AS cnt
           FROM post_bookmarks pb
           JOIN posts p ON p.id = pb.post_id
           WHERE pb.user_id = ?`
        )
          .bind(targetId)
          .first<{ cnt: number }>()
      : Promise.resolve(null),
    sessionUser && !isSelf
      ? c.env.DB.prepare(
          'SELECT 1 AS ok FROM user_follows WHERE follower_id = ? AND following_id = ? LIMIT 1'
        )
          .bind(sessionUser.id, targetId)
          .first<{ ok: number }>()
      : Promise.resolve(null),
  ]);

  const isOfficial = Boolean(row.is_official);
  const userPayload: Record<string, unknown> = {
    id: row.id,
    nickname: row.nickname,
    avatarSeed: row.avatar_seed,
    avatarUrl: row.avatar_url ?? '',
    bio: row.bio ?? '',
    isOfficial,
    ...(isOfficial
      ? {
          officialBadge: row.official_badge || '官方',
          ...(row.official_handle ? { handle: row.official_handle } : {}),
        }
      : {}),
    createdAt: row.created_at,
    postsCount: Number(postsRow?.cnt ?? 0),
    followingCount: Number(followingRow?.cnt ?? 0),
    followersCount: Number(followersRow?.cnt ?? 0),
    likesCount: Number(likesRow?.cnt ?? 0),
    commentsCount: Number(commentsRow?.cnt ?? 0),
    repliesCount: Number(repliesRow?.cnt ?? 0),
    isFollowing: Boolean(followRel?.ok),
    isSelf,
  };

  if (isSelf) {
    userPayload.email = row.email;
    userPayload.bookmarksCount = Number(bookmarksRow?.cnt ?? 0);
  }

  return c.json({ user: userPayload });
});

userRoutes.post('/:id/follow', async (c) => {
  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!sessionUser) {
    return c.json({ error: '请先登录后再关注用户' }, 401);
  }

  const targetId = c.req.param('id');
  if (targetId === sessionUser.id) {
    return c.json({ error: '不能关注自己' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(targetId)
    .first<{ id: string }>();
  if (!targetUser) {
    return c.json({ error: '目标用户不存在' }, 404);
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 AS ok FROM user_follows WHERE follower_id = ? AND following_id = ? LIMIT 1'
  )
    .bind(sessionUser.id, targetId)
    .first<{ ok: number }>();

  let following = false;
  if (existing) {
    const delRes = await c.env.DB.prepare(
      'DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?'
    )
      .bind(sessionUser.id, targetId)
      .run();
    if (delRes.meta.changes && delRes.meta.changes > 0) {
      await clearUnreadFollowNotification(c.env, {
        recipientId: targetId,
        actorId: sessionUser.id,
      });
    }
    following = false;
  } else {
    const insRes = await c.env.DB.prepare(
      'INSERT OR IGNORE INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)'
    )
      .bind(sessionUser.id, targetId, new Date().toISOString())
      .run();
    if (insRes.meta.changes && insRes.meta.changes > 0) {
      await createOrUpdateNotification(c.env, {
        recipientId: targetId,
        actorId: sessionUser.id,
        type: 'follow',
        contentPreview: '关注了你',
      });
    }
    following = true;
  }

  const [followersRow, myFollowingRow] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM user_follows WHERE following_id = ?')
      .bind(targetId)
      .first<{ cnt: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM user_follows WHERE follower_id = ?')
      .bind(sessionUser.id)
      .first<{ cnt: number }>(),
  ]);

  return c.json({
    ok: true,
    following,
    followersCount: Number(followersRow?.cnt ?? 0),
    followingCount: Number(myFollowingRow?.cnt ?? 0),
  });
});

userRoutes.get('/:id/follows', async (c) => {
  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));
  const rawId = c.req.param('id');
  if (rawId === 'me' && !sessionUser) {
    return c.json({ error: '请先登录' }, 401);
  }
  const targetId = rawId === 'me' ? sessionUser!.id : rawId;

  const type = c.req.query('type');
  const limitRaw = c.req.query('limit');
  const offsetRaw = c.req.query('offset');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 30;
  const offset = offsetRaw !== undefined ? Number(offsetRaw) : 0;

  if (
    (type !== 'following' && type !== 'followers') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return c.json({ error: '查询参数无效' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(targetId)
    .first<{ id: string }>();
  if (!targetUser) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const joinField = type === 'following' ? 'uf.following_id' : 'uf.follower_id';
  const whereField = type === 'following' ? 'uf.follower_id' : 'uf.following_id';

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM user_follows uf WHERE ${whereField} = ?`
  )
    .bind(targetId)
    .first<{ total: number }>();

  const viewerId = sessionUser?.id ?? '';
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.avatar_seed,
            COALESCE(up.avatar_url, '') AS avatar_url,
            COALESCE(up.bio, '') AS bio,
            CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
            COALESCE(oa.badge_label, '') AS official_badge,
            uf.created_at AS followed_at,
            CASE WHEN ? != '' AND EXISTS (
              SELECT 1 FROM user_follows f2 WHERE f2.follower_id = ? AND f2.following_id = u.id
            ) THEN 1 ELSE 0 END AS is_following
     FROM user_follows uf
     JOIN users u ON u.id = ${joinField}
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN official_accounts oa ON oa.user_id = u.id
     WHERE ${whereField} = ?
     ORDER BY uf.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(viewerId, viewerId, targetId, limit, offset)
    .all<FollowUserRow>();

  return c.json({
    type,
    users: (rows.results ?? []).map((u) => {
      const isOfficial = Boolean(u.is_official);
      return {
        id: u.id,
        nickname: u.nickname,
        avatarSeed: u.avatar_seed,
        avatarUrl: u.avatar_url ?? '',
        bio: u.bio ?? '',
        isOfficial,
        ...(isOfficial ? { officialBadge: u.official_badge || '官方' } : {}),
        isFollowing: Boolean(u.is_following),
        followedAt: u.followed_at,
      };
    }),
    total: Number(countRow?.total ?? 0),
  });
});

userRoutes.get('/:id/activity', async (c) => {
  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));
  const rawId = c.req.param('id');
  if (rawId === 'me' && !sessionUser) {
    return c.json({ error: '请先登录' }, 401);
  }
  const targetId = rawId === 'me' ? sessionUser!.id : rawId;

  const tab = c.req.query('tab');
  const limitRaw = c.req.query('limit');
  const offsetRaw = c.req.query('offset');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 24;
  const offset = offsetRaw !== undefined ? Number(offsetRaw) : 0;

  if (
    (tab !== 'posts' &&
      tab !== 'likes' &&
      tab !== 'comments' &&
      tab !== 'replies' &&
      tab !== 'bookmarks') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return c.json({ error: '查询参数无效' }, 400);
  }

  if (tab === 'bookmarks') {
    if (!sessionUser) {
      return c.json({ error: '请先登录' }, 401);
    }
    if (targetId !== sessionUser.id) {
      return c.json({ error: '无权查看他人的收藏列表' }, 403);
    }
  }

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(targetId)
    .first<{ id: string }>();
  if (!targetUser) {
    return c.json({ error: '用户不存在' }, 404);
  }

  if (tab === 'bookmarks') {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM post_bookmarks pb
       JOIN posts p ON p.id = pb.post_id
       WHERE pb.user_id = ?`
    )
      .bind(targetId)
      .first<{ total: number }>();

    const rows = await c.env.DB.prepare(
      `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
              p.likes_count, p.comments_count, p.created_at,
              COALESCE(pm.views_count, 0) AS views_count,
              COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
              COALESCE(pm.shares_count, 0) AS shares_count,
              u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
              COALESCE(oa.badge_label, '') AS author_official_badge,
              CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me,
              1 AS bookmarked_by_me
       FROM post_bookmarks pb
       JOIN posts p ON p.id = pb.post_id
       JOIN users u ON u.id = p.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       LEFT JOIN post_metrics pm ON pm.post_id = p.id
       LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?
       WHERE pb.user_id = ?
       ORDER BY pb.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(sessionUser!.id, targetId, limit, offset)
      .all<PostRow>();

    const postResults = rows.results ?? [];
    const mentionsMap = await fetchMentionsForPostIds(
      c.env.DB,
      postResults.map((r) => r.id)
    );

    return c.json({
      tab,
      items: postResults.map((r) => serializePost(r, mentionsMap.get(r.id) ?? [])),
      total: Number(countRow?.total ?? 0),
    });
  }

  if (tab === 'posts') {
    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM posts WHERE author_id = ?'
    )
      .bind(targetId)
      .first<{ total: number }>();

    const rows = sessionUser
      ? await c.env.DB.prepare(
          `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
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
           WHERE p.author_id = ?
           ORDER BY p.created_at DESC
           LIMIT ? OFFSET ?`
        )
          .bind(sessionUser.id, sessionUser.id, targetId, limit, offset)
          .all<PostRow>()
      : await c.env.DB.prepare(
          `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
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
           WHERE p.author_id = ?
           ORDER BY p.created_at DESC
           LIMIT ? OFFSET ?`
        )
          .bind(targetId, limit, offset)
          .all<PostRow>();

    const postResults = rows.results ?? [];
    const mentionsMap = await fetchMentionsForPostIds(
      c.env.DB,
      postResults.map((r) => r.id)
    );

    return c.json({
      tab,
      items: postResults.map((r) => serializePost(r, mentionsMap.get(r.id) ?? [])),
      total: Number(countRow?.total ?? 0),
    });
  }

  if (tab === 'likes') {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM post_likes pl
       JOIN posts p ON p.id = pl.post_id
       WHERE pl.user_id = ?`
    )
      .bind(targetId)
      .first<{ total: number }>();

    const rows = sessionUser
      ? await c.env.DB.prepare(
          `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
                  p.likes_count, p.comments_count, p.created_at,
                  COALESCE(pm.views_count, 0) AS views_count,
                  COALESCE(pm.bookmarks_count, 0) AS bookmarks_count,
                  COALESCE(pm.shares_count, 0) AS shares_count,
                  u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
                  COALESCE(up.avatar_url, '') AS author_avatar_url,
                  CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS author_is_official,
                  COALESCE(oa.badge_label, '') AS author_official_badge,
                  CASE WHEN pl_me.user_id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me,
                  CASE WHEN pb_me.user_id IS NOT NULL THEN 1 ELSE 0 END AS bookmarked_by_me
           FROM post_likes pl
           JOIN posts p ON p.id = pl.post_id
           JOIN users u ON u.id = p.author_id
           LEFT JOIN user_profiles up ON up.user_id = u.id
           LEFT JOIN official_accounts oa ON oa.user_id = u.id
           LEFT JOIN post_metrics pm ON pm.post_id = p.id
           LEFT JOIN post_likes pl_me ON pl_me.post_id = p.id AND pl_me.user_id = ?
           LEFT JOIN post_bookmarks pb_me ON pb_me.post_id = p.id AND pb_me.user_id = ?
           WHERE pl.user_id = ?
           ORDER BY pl.created_at DESC
           LIMIT ? OFFSET ?`
        )
          .bind(sessionUser.id, sessionUser.id, targetId, limit, offset)
          .all<PostRow>()
      : await c.env.DB.prepare(
          `SELECT p.id, p.author_id, p.content, p.image_url, p.tags_json,
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
           FROM post_likes pl
           JOIN posts p ON p.id = pl.post_id
           JOIN users u ON u.id = p.author_id
           LEFT JOIN user_profiles up ON up.user_id = u.id
           LEFT JOIN official_accounts oa ON oa.user_id = u.id
           LEFT JOIN post_metrics pm ON pm.post_id = p.id
           WHERE pl.user_id = ?
           ORDER BY pl.created_at DESC
           LIMIT ? OFFSET ?`
        )
          .bind(targetId, limit, offset)
          .all<PostRow>();

    const postResults = rows.results ?? [];
    const mentionsMap = await fetchMentionsForPostIds(
      c.env.DB,
      postResults.map((r) => r.id)
    );

    return c.json({
      tab,
      items: postResults.map((r) => serializePost(r, mentionsMap.get(r.id) ?? [])),
      total: Number(countRow?.total ?? 0),
    });
  }

  if (tab === 'comments') {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM comments cm
       JOIN posts p ON p.id = cm.post_id
       WHERE cm.author_id = ?`
    )
      .bind(targetId)
      .first<{ total: number }>();

    const rows = await c.env.DB.prepare(
      `SELECT cm.id, cm.post_id, p.content AS post_content, cm.content, cm.created_at,
              u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
              COALESCE(up.avatar_url, '') AS author_avatar_url
       FROM comments cm
       JOIN posts p ON p.id = cm.post_id
       JOIN users u ON u.id = cm.author_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE cm.author_id = ?
       ORDER BY cm.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(targetId, limit, offset)
      .all<CommentActivityRow>();

    return c.json({
      tab,
      items: (rows.results ?? []).map((cm) => ({
        id: cm.id,
        postId: cm.post_id,
        postContentPreview: makeContentPreview(cm.post_content, 80),
        content: cm.content,
        author: {
          id: cm.author_id,
          nickname: cm.author_nickname,
          avatarSeed: cm.author_avatar_seed,
          avatarUrl: cm.author_avatar_url ?? '',
        },
        createdAt: cm.created_at,
      })),
      total: Number(countRow?.total ?? 0),
    });
  }

  // tab === 'replies'
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM comment_replies cr
     JOIN comments cm ON cm.id = cr.comment_id
     JOIN posts p ON p.id = cr.post_id
     WHERE cr.author_id = ? OR cm.author_id = ? OR cr.reply_to_user_id = ?`
  )
    .bind(targetId, targetId, targetId)
    .first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT cr.id, cr.comment_id, cr.post_id, p.content AS post_content,
            cm.content AS parent_comment_content,
            cr.content, cr.created_at,
            u.id AS author_id, u.nickname AS author_nickname, u.avatar_seed AS author_avatar_seed,
            COALESCE(up.avatar_url, '') AS author_avatar_url,
            cr.reply_to_user_id, ru.nickname AS reply_to_nickname
     FROM comment_replies cr
     JOIN comments cm ON cm.id = cr.comment_id
     JOIN posts p ON p.id = cr.post_id
     JOIN users u ON u.id = cr.author_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN users ru ON ru.id = cr.reply_to_user_id
     WHERE cr.author_id = ? OR cm.author_id = ? OR cr.reply_to_user_id = ?
     ORDER BY cr.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(targetId, targetId, targetId, limit, offset)
    .all<ReplyActivityRow>();

  return c.json({
    tab,
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      commentId: r.comment_id,
      postId: r.post_id,
      postContentPreview: makeContentPreview(r.post_content, 80),
      parentCommentContent: r.parent_comment_content,
      content: r.content,
      direction: r.author_id === targetId ? ('sent' as const) : ('received' as const),
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
    })),
    total: Number(countRow?.total ?? 0),
  });
});
