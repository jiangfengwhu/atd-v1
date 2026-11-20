import { Hono } from 'hono';
import { getDb } from '../db';
import { getSystemSettings } from '../services/resend';
import { AppVariables, Env } from '../types';

export const statsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

// GET /api/v1/stats/overview - Real community totals & top posts
statsRoute.get('/stats/overview', async (c) => {
  try {
    const db = getDb(c);
    const [
      postsCount,
      usersCount,
      commentsCount,
      likesCount,
      repostsCount,
      clicksSum,
      hotRes,
      settings,
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) as c FROM posts').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM comments').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM post_likes').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM post_reposts').first<{ c: number }>(),
      db
        .prepare('SELECT COALESCE(SUM(views_count), 0) as c FROM post_views')
        .first<{ c: number }>(),
      db
        .prepare(
          `SELECT
            p.id,
            p.content,
            COALESCE(u.username, 'User-' || substr(p.user_id, 1, 6)) AS author_name,
            (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
            (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS reposts_count,
            (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count,
            COALESCE((SELECT pv.views_count FROM post_views pv WHERE pv.post_id = p.id), 0) AS clicks_count
          FROM posts p
          LEFT JOIN users u ON u.id = p.user_id
          ORDER BY
            (likes_count * 3 + reposts_count * 4 + comments_count * 2 + clicks_count) DESC,
            p.created_at DESC
          LIMIT 5`
        )
        .all<{
          id: string;
          content: string;
          author_name: string;
          likes_count: number;
          reposts_count: number;
          comments_count: number;
          clicks_count: number;
        }>(),
      getSystemSettings(db, c.env),
    ]);

    return c.json(
      {
        site_name: settings.site_name,
        totals: {
          posts: Number(postsCount?.c ?? 0),
          users: Number(usersCount?.c ?? 0),
          comments: Number(commentsCount?.c ?? 0),
          likes: Number(likesCount?.c ?? 0),
          reposts: Number(repostsCount?.c ?? 0),
          clicks: Number(clicksSum?.c ?? 0),
        },
        hot_posts: (hotRes.results || []).map((row) => ({
          id: row.id,
          content: row.content,
          author_name: row.author_name,
          likes_count: Number(row.likes_count || 0),
          reposts_count: Number(row.reposts_count || 0),
          comments_count: Number(row.comments_count || 0),
          clicks_count: Number(row.clicks_count || 0),
        })),
      },
      200
    );
  } catch (err: any) {
    console.error('Error in GET /stats/overview:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to load community statistics' },
      500
    );
  }
});
