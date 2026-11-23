import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';

const FALLBACK_TOPICS = [
  '日常碎碎念',
  '摄影美学',
  '好物分享',
  '咖啡时光',
  '数码桌搭',
  '城市漫步',
  '胶片日记',
  '周末探店',
  '读书笔记',
  '极简生活',
  '旅行攻略',
  '美食记录',
];

interface TopicAggregateRow {
  tag: string;
  posts_count: number;
  heat_score: number;
}

interface RecommendedUserRow {
  id: string;
  nickname: string;
  avatar_seed: string;
  avatar_url: string;
  bio: string;
  followers_count: number;
  posts_count: number;
}

export const discoverRoutes = new Hono<AppEnv>();

discoverRoutes.get('/topics', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 6;

  if (limitRaw === '' || !Number.isInteger(limit) || limit < 1 || limit > 12) {
    return c.json({ error: 'limit 参数需为 1 到 12 的整数' }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT
       je.value AS tag,
       COUNT(DISTINCT p.id) AS posts_count,
       SUM(
         10
         + COALESCE(p.likes_count, 0) * 3
         + COALESCE(p.comments_count, 0) * 4
         + COALESCE(pm.views_count, 0)
         + COALESCE(pm.bookmarks_count, 0) * 3
         + COALESCE(pm.shares_count, 0) * 3
       ) AS heat_score
     FROM posts p
     JOIN json_each(p.tags_json) je
     LEFT JOIN post_metrics pm ON pm.post_id = p.id
     WHERE je.type = 'text' AND trim(je.value) != ''
     GROUP BY je.value
     ORDER BY heat_score DESC, posts_count DESC, je.value ASC
     LIMIT ?`
  )
    .bind(limit)
    .all<TopicAggregateRow>();

  const topics = (rows.results ?? []).map((r) => ({
    tag: r.tag,
    postsCount: Number(r.posts_count ?? 0),
    heatScore: Number(r.heat_score ?? 0),
  }));

  if (topics.length < limit) {
    const existingTags = new Set(topics.map((t) => t.tag));
    for (const fallbackTag of FALLBACK_TOPICS) {
      if (topics.length >= limit) break;
      if (!existingTags.has(fallbackTag)) {
        existingTags.add(fallbackTag);
        topics.push({
          tag: fallbackTag,
          postsCount: 0,
          heatScore: 0,
        });
      }
    }
  }

  return c.json({ topics });
});

discoverRoutes.get('/recommended-users', async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = limitRaw !== undefined ? Number(limitRaw) : 5;

  if (limitRaw === '' || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    return c.json({ error: 'limit 参数需为 1 到 10 的整数' }, 400);
  }

  const sessionUser = await getSessionUser(c.env.DB, c.req.header('cookie'));
  const viewerId = sessionUser?.id ?? '';

  const rows = await c.env.DB.prepare(
    `SELECT
       u.id,
       u.nickname,
       u.avatar_seed,
       COALESCE(up.avatar_url, '') AS avatar_url,
       COALESCE(up.bio, '') AS bio,
       (SELECT COUNT(*) FROM user_follows uf WHERE uf.following_id = u.id) AS followers_count,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS posts_count
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE (? = '' OR u.id != ?)
       AND (? = '' OR NOT EXISTS (
         SELECT 1 FROM user_follows uf2
         WHERE uf2.follower_id = ? AND uf2.following_id = u.id
       ))
     ORDER BY followers_count DESC, posts_count DESC, u.created_at DESC
     LIMIT ?`
  )
    .bind(viewerId, viewerId, viewerId, viewerId, limit)
    .all<RecommendedUserRow>();

  return c.json({
    users: (rows.results ?? []).map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatarSeed: u.avatar_seed,
      avatarUrl: u.avatar_url ?? '',
      bio: u.bio ?? '',
      followersCount: Number(u.followers_count ?? 0),
      postsCount: Number(u.posts_count ?? 0),
      isFollowing: false,
    })),
  });
});
