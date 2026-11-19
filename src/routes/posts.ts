import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth, optionalAuth } from '../middleware/fingerprint';
import { Env, AppVariables, PostRecord } from '../types';

export const postsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

function encodeCursor(post: { created_at: string; id: string }): string {
  const payload = JSON.stringify({ c: post.created_at, i: post.id });
  return typeof btoa === 'function'
    ? btoa(payload)
    : Buffer.from(payload).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = typeof atob === 'function'
      ? atob(cursor)
      : Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.c === 'string' && typeof parsed.i === 'string') {
      return { createdAt: parsed.c, id: parsed.i };
    }
  } catch {
    const idx = cursor.indexOf('_');
    if (idx > 0) {
      return { createdAt: cursor.substring(0, idx), id: cursor.substring(idx + 1) };
    }
  }
  return null;
}

// POST /api/v1/posts - Create a new post
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

  const content = body?.content;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return c.json(
      {
        error: '400_INVALID_CONTENT',
        message: 'Content cannot be empty or pure whitespace',
      },
      400
    );
  }

  const userId = c.get('userId');
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const db = getDb(c);
    await db
      .prepare(
        'INSERT INTO posts (id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
      )
      .bind(id, userId, content, createdAt)
      .run();

    return c.json(
      {
        id,
        created_at: createdAt,
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

// GET /api/v1/feed - Get post feed with cursor pagination
postsRoute.get('/feed', optionalAuth, async (c) => {
  const rawLimit = c.req.query('limit');
  const cursorParam = c.req.query('cursor');

  let limit = 20;
  if (rawLimit !== undefined) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  }

  try {
    const db = getDb(c);
    let posts: PostRecord[] = [];
    let nextCursor = '';

    const cursor = cursorParam ? decodeCursor(cursorParam) : null;

    if (cursor) {
      const res = await db
        .prepare(
          'SELECT id, user_id, content, created_at FROM posts WHERE (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?'
        )
        .bind(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
        .all<PostRecord>();

      const rows = res.results || [];
      if (rows.length > limit) {
        posts = rows.slice(0, limit);
        const last = posts[posts.length - 1];
        nextCursor = encodeCursor(last);
      } else {
        posts = rows;
        nextCursor = '';
      }
    } else {
      const res = await db
        .prepare(
          'SELECT id, user_id, content, created_at FROM posts ORDER BY created_at DESC, id DESC LIMIT ?'
        )
        .bind(limit + 1)
        .all<PostRecord>();

      const rows = res.results || [];
      if (rows.length > limit) {
        posts = rows.slice(0, limit);
        const last = posts[posts.length - 1];
        nextCursor = encodeCursor(last);
      } else {
        posts = rows;
        nextCursor = '';
      }
    }

    return c.json(
      {
        posts: posts.map((p) => ({
          id: p.id,
          content: p.content,
          user_id: p.user_id,
          created_at: p.created_at,
        })),
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

// GET /api/v1/posts/:id - Get a single post
postsRoute.get('/posts/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  try {
    const db = getDb(c);
    const post = await db
      .prepare('SELECT id, user_id, content, created_at FROM posts WHERE id = ?')
      .bind(id)
      .first<PostRecord>();

    if (!post) {
      return c.json({ error: '404_POST_NOT_FOUND', message: 'Post not found' }, 404);
    }

    return c.json(post, 200);
  } catch (err: any) {
    return c.json({ error: '500_DB_ERROR', message: 'Database error' }, 500);
  }
});
