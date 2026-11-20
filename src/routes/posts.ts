import { Hono } from 'hono';
import { DatabaseAdapter, getDb } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { getSystemSettings } from '../services/resend';
import { AppVariables, Env, PostImageItem, PostRecord } from '../types';

export const postsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

interface PostFeedRow {
  id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
  likes_count: number;
  reposts_count: number;
  comments_count: number;
  clicks_count: number;
  user_liked: number;
  user_reposted: number;
  hot_score?: number;
}

interface PostMediaJoinRow {
  post_id: string;
  media_id: string;
  mime_type: string;
  sort_order: number;
}

function encodeLatestCursor(post: { created_at: string; id: string }): string {
  const payload = JSON.stringify({ c: post.created_at, i: post.id });
  return typeof btoa === 'function'
    ? btoa(payload)
    : Buffer.from(payload).toString('base64');
}

function encodeHotCursor(post: {
  hot_score: number;
  created_at: string;
  id: string;
}): string {
  const payload = JSON.stringify({
    s: post.hot_score,
    c: post.created_at,
    i: post.id,
  });
  return typeof btoa === 'function'
    ? btoa(payload)
    : Buffer.from(payload).toString('base64');
}

function decodeCursor(
  cursor: string
): { score?: number; createdAt: string; id: string } | null {
  try {
    const raw =
      typeof atob === 'function'
        ? atob(cursor)
        : Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.c === 'string' && typeof parsed.i === 'string') {
      return {
        score: typeof parsed.s === 'number' ? parsed.s : undefined,
        createdAt: parsed.c,
        id: parsed.i,
      };
    }
  } catch {
    const idx = cursor.indexOf('_');
    if (idx > 0) {
      return {
        createdAt: cursor.substring(0, idx),
        id: cursor.substring(idx + 1),
      };
    }
  }
  return null;
}

async function fetchImagesMapForPosts(
  db: DatabaseAdapter,
  postIds: string[]
): Promise<Map<string, PostImageItem[]>> {
  const map = new Map<string, PostImageItem[]>();
  if (postIds.length === 0) return map;

  const placeholders = postIds.map(() => '?').join(', ');
  const res = await db
    .prepare(
      `SELECT pm.post_id, pm.media_id, ma.mime_type, pm.sort_order
       FROM post_media pm
       JOIN media_assets ma ON ma.id = pm.media_id
       WHERE pm.post_id IN (${placeholders})
       ORDER BY pm.sort_order ASC`
    )
    .bind(...postIds)
    .all<PostMediaJoinRow>();

  for (const row of res.results || []) {
    const list = map.get(row.post_id) || [];
    list.push({
      id: row.media_id,
      url: `/api/v1/media/${row.media_id}`,
      mime_type: row.mime_type,
    });
    map.set(row.post_id, list);
  }
  return map;
}

function serializePost(
  row: PostFeedRow,
  imagesMap: Map<string, PostImageItem[]>
): PostRecord {
  const clicks = Number(row.clicks_count || 0);
  return {
    id: row.id,
    user_id: row.user_id,
    author_name: row.author_name || `User-${row.user_id.slice(0, 6)}`,
    content: row.content,
    images: imagesMap.get(row.id) || [],
    clicks_count: clicks,
    views_count: clicks,
    likes_count: Number(row.likes_count || 0),
    reposts_count: Number(row.reposts_count || 0),
    comments_count: Number(row.comments_count || 0),
    user_liked: Boolean(row.user_liked),
    user_reposted: Boolean(row.user_reposted),
    created_at: row.created_at,
  };
}

// POST /api/v1/posts - Create a new text/image post
postsRoute.post('/posts', requireAuth, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CONTENT', message: 'Invalid JSON request body' },
      400
    );
  }

  const rawContent = body?.content;
  if (rawContent !== undefined && typeof rawContent !== 'string') {
    return c.json(
      { error: '400_INVALID_CONTENT', message: 'Post content must be a string' },
      400
    );
  }
  const content = typeof rawContent === 'string' ? rawContent : '';
  const hasText = content.trim().length > 0;

  let mediaIds: string[] = [];
  if (body?.media_ids !== undefined) {
    if (!Array.isArray(body.media_ids)) {
      return c.json(
        { error: '400_INVALID_MEDIA', message: 'media_ids must be an array' },
        400
      );
    }
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of body.media_ids) {
      if (typeof item !== 'string' || !item.trim()) {
        return c.json(
          { error: '400_INVALID_MEDIA', message: 'Each media_id must be a non-empty string' },
          400
        );
      }
      const cleanId = item.trim();
      if (!seen.has(cleanId)) {
        seen.add(cleanId);
        deduped.push(cleanId);
      }
    }
    mediaIds = deduped;
  }

  if (!hasText && mediaIds.length === 0) {
    return c.json(
      {
        error: '400_INVALID_CONTENT',
        message: 'Content cannot be empty when no images are attached',
      },
      400
    );
  }

  const userId = c.get('userId');

  try {
    const db = getDb(c);
    const settings = await getSystemSettings(db, c.env);
    const maxImages = settings.max_images_per_post || 4;

    if (mediaIds.length > maxImages) {
      return c.json(
        {
          error: '400_INVALID_MEDIA',
          message: `单条动态最多支持上传 ${maxImages} 张图片`,
        },
        400
      );
    }

    const mediaRecords: Array<{ id: string; mime_type: string }> = [];
    if (mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(', ');
      const res = await db
        .prepare(`SELECT id, mime_type FROM media_assets WHERE id IN (${placeholders})`)
        .bind(...mediaIds)
        .all<{ id: string; mime_type: string }>();

      const foundById = new Map<string, { id: string; mime_type: string }>();
      for (const row of res.results || []) {
        foundById.set(row.id, row);
      }

      for (const mid of mediaIds) {
        const found = foundById.get(mid);
        if (!found) {
          return c.json(
            {
              error: '400_INVALID_MEDIA',
              message: `Media asset ${mid} does not exist`,
            },
            400
          );
        }
        mediaRecords.push(found);
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db
      .prepare('INSERT INTO posts (id, user_id, content, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, userId, hasText ? content : '', createdAt)
      .run();

    for (let i = 0; i < mediaIds.length; i++) {
      await db
        .prepare(
          'INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)'
        )
        .bind(id, mediaIds[i], i)
        .run();
    }

    return c.json(
      {
        id,
        created_at: createdAt,
        images: mediaRecords.map((m) => ({
          id: m.id,
          url: `/api/v1/media/${m.id}`,
          mime_type: m.mime_type,
        })),
      },
      201
    );
  } catch (err: any) {
    console.error('Database error in POST /posts:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to create post' },
      500
    );
  }
});

// GET /api/v1/feed - Get post feed with cursor pagination, sorting & search
postsRoute.get('/feed', optionalAuth, async (c) => {
  const rawLimit = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const sortParam = c.req.query('sort') === 'hot' ? 'hot' : 'latest';
  const searchParam = (c.req.query('q') || '').trim();
  const currentUserId = c.get('userId') || '';

  let limit = 20;
  if (rawLimit !== undefined) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  }

  try {
    const db = getDb(c);
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;

    const baseWhereClauses: string[] = [];
    const baseWhereParams: any[] = [];
    if (searchParam) {
      baseWhereClauses.push('p.content LIKE ?');
      baseWhereParams.push(`%${searchParam}%`);
    }

    const baseSelect = `
      SELECT
        p.id,
        p.user_id,
        COALESCE(u.username, 'User-' || substr(p.user_id, 1, 6)) AS author_name,
        p.content,
        p.created_at,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
        (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS reposts_count,
        (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count,
        COALESCE((SELECT pv.views_count FROM post_views pv WHERE pv.post_id = p.id), 0) AS clicks_count,
        CASE WHEN EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) THEN 1 ELSE 0 END AS user_liked,
        CASE WHEN EXISTS(SELECT 1 FROM post_reposts pr2 WHERE pr2.post_id = p.id AND pr2.user_id = ?) THEN 1 ELSE 0 END AS user_reposted,
        (
          (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) * 3 +
          (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) * 4 +
          (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) * 2 +
          COALESCE((SELECT pv.views_count FROM post_views pv WHERE pv.post_id = p.id), 0)
        ) AS hot_score
      FROM posts p
      LEFT JOIN users u ON u.id = p.user_id
    `;

    let rows: PostFeedRow[] = [];

    if (sortParam === 'hot') {
      const innerWhere =
        baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';
      let outerWhere = '';
      const outerParams: any[] = [];

      if (cursor && cursor.score !== undefined) {
        outerWhere =
          'WHERE (hot_score < ? OR (hot_score = ? AND (created_at < ? OR (created_at = ? AND id < ?))))';
        outerParams.push(
          cursor.score,
          cursor.score,
          cursor.createdAt,
          cursor.createdAt,
          cursor.id
        );
      }

      const sql = `
        SELECT * FROM (${baseSelect} ${innerWhere}) AS feed_sub
        ${outerWhere}
        ORDER BY hot_score DESC, created_at DESC, id DESC
        LIMIT ?
      `;
      const res = await db
        .prepare(sql)
        .bind(currentUserId, currentUserId, ...baseWhereParams, ...outerParams, limit + 1)
        .all<PostFeedRow>();
      rows = res.results || [];
    } else {
      const clauses = [...baseWhereClauses];
      const params: any[] = [currentUserId, currentUserId, ...baseWhereParams];

      if (cursor) {
        clauses.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `
        ${baseSelect}
        ${whereSql}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
      `;
      const res = await db
        .prepare(sql)
        .bind(...params, limit + 1)
        .all<PostFeedRow>();
      rows = res.results || [];
    }

    let nextCursor = '';
    let pageRows = rows;
    if (rows.length > limit) {
      pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      nextCursor =
        sortParam === 'hot'
          ? encodeHotCursor({
              hot_score: Number(last.hot_score || 0),
              created_at: last.created_at,
              id: last.id,
            })
          : encodeLatestCursor(last);
    }

    const imagesMap = await fetchImagesMapForPosts(
      db,
      pageRows.map((r) => r.id)
    );

    return c.json(
      {
        posts: pageRows.map((r) => serializePost(r, imagesMap)),
        next_cursor: nextCursor,
      },
      200
    );
  } catch (err: any) {
    console.error('Database error in GET /feed:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Database error fetching feed' },
      500
    );
  }
});

// GET /api/v1/posts/:id - Get a single post with full media and real stats
postsRoute.get('/posts/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const currentUserId = c.get('userId') || '';

  try {
    const db = getDb(c);
    const row = await db
      .prepare(
        `SELECT
          p.id,
          p.user_id,
          COALESCE(u.username, 'User-' || substr(p.user_id, 1, 6)) AS author_name,
          p.content,
          p.created_at,
          (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
          (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS reposts_count,
          (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count,
          COALESCE((SELECT pv.views_count FROM post_views pv WHERE pv.post_id = p.id), 0) AS clicks_count,
          CASE WHEN EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) THEN 1 ELSE 0 END AS user_liked,
          CASE WHEN EXISTS(SELECT 1 FROM post_reposts pr2 WHERE pr2.post_id = p.id AND pr2.user_id = ?) THEN 1 ELSE 0 END AS user_reposted
        FROM posts p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?`
      )
      .bind(currentUserId, currentUserId, id)
      .first<PostFeedRow>();

    if (!row) {
      return c.json({ error: '404_POST_NOT_FOUND', message: 'Post not found' }, 404);
    }

    const imagesMap = await fetchImagesMapForPosts(db, [row.id]);
    return c.json(serializePost(row, imagesMap), 200);
  } catch (err: any) {
    console.error('Database error in GET /posts/:id:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Database error' }, 500);
  }
});

// POST /api/v1/posts/:id/like - Toggle like for authenticated user
postsRoute.post('/posts/:id/like', requireAuth, async (c) => {
  const postId = c.req.param('id');
  const userId = c.get('userId');

  try {
    const db = getDb(c);
    const post = await db
      .prepare('SELECT id FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ id: string }>();

    if (!post) {
      return c.json({ error: '404_POST_NOT_FOUND', message: 'Post not found' }, 404);
    }

    const existing = await db
      .prepare('SELECT post_id FROM post_likes WHERE post_id = ? AND user_id = ?')
      .bind(postId, userId)
      .first<{ post_id: string }>();

    let liked = false;
    if (existing) {
      await db
        .prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
        .bind(postId, userId)
        .run();
      liked = false;
    } else {
      await db
        .prepare(
          'INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)'
        )
        .bind(postId, userId, new Date().toISOString())
        .run();
      liked = true;
    }

    const countRow = await db
      .prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?')
      .bind(postId)
      .first<{ count: number }>();

    return c.json(
      {
        post_id: postId,
        liked,
        likes_count: Number(countRow?.count ?? 0),
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /posts/:id/like:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to toggle like' }, 500);
  }
});

// POST /api/v1/posts/:id/repost - Toggle repost for authenticated user
postsRoute.post('/posts/:id/repost', requireAuth, async (c) => {
  const postId = c.req.param('id');
  const userId = c.get('userId');

  try {
    const db = getDb(c);
    const post = await db
      .prepare('SELECT id FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ id: string }>();

    if (!post) {
      return c.json({ error: '404_POST_NOT_FOUND', message: 'Post not found' }, 404);
    }

    const existing = await db
      .prepare('SELECT post_id FROM post_reposts WHERE post_id = ? AND user_id = ?')
      .bind(postId, userId)
      .first<{ post_id: string }>();

    let reposted = false;
    if (existing) {
      await db
        .prepare('DELETE FROM post_reposts WHERE post_id = ? AND user_id = ?')
        .bind(postId, userId)
        .run();
      reposted = false;
    } else {
      await db
        .prepare(
          'INSERT OR IGNORE INTO post_reposts (post_id, user_id, created_at) VALUES (?, ?, ?)'
        )
        .bind(postId, userId, new Date().toISOString())
        .run();
      reposted = true;
    }

    const countRow = await db
      .prepare('SELECT COUNT(*) as count FROM post_reposts WHERE post_id = ?')
      .bind(postId)
      .first<{ count: number }>();

    return c.json(
      {
        post_id: postId,
        reposted,
        reposts_count: Number(countRow?.count ?? 0),
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /posts/:id/repost:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to toggle repost' }, 500);
  }
});

// POST /api/v1/posts/:id/click - Atomically increment click/view counter
postsRoute.post('/posts/:id/click', async (c) => {
  const postId = c.req.param('id');

  try {
    const db = getDb(c);
    const post = await db
      .prepare('SELECT id FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ id: string }>();

    if (!post) {
      return c.json({ error: '404_POST_NOT_FOUND', message: 'Post not found' }, 404);
    }

    await db
      .prepare(
        `INSERT INTO post_views (post_id, views_count)
         VALUES (?, 1)
         ON CONFLICT(post_id) DO UPDATE SET views_count = views_count + 1`
      )
      .bind(postId)
      .run();

    const row = await db
      .prepare('SELECT views_count FROM post_views WHERE post_id = ?')
      .bind(postId)
      .first<{ views_count: number }>();

    const count = Number(row?.views_count ?? 1);
    return c.json(
      {
        post_id: postId,
        clicks_count: count,
        views_count: count,
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /posts/:id/click:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to record click' }, 500);
  }
});
