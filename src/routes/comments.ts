import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth, optionalAuth } from '../middleware/fingerprint';
import { Env, AppVariables, CommentRecord, PostRecord } from '../types';

export const commentsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

// POST /api/v1/posts/:postId/comments - Add a reply / comment to a post
commentsRoute.post('/posts/:postId/comments', requireAuth, async (c) => {
  const postId = c.req.param('postId');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CONTENT', message: 'Invalid JSON request body' },
      400
    );
  }

  const { content, parent_id } = body || {};
  if (!content || typeof content !== 'string' || !content.trim()) {
    return c.json(
      {
        error: '400_INVALID_CONTENT',
        message: 'Comment content cannot be empty',
      },
      400
    );
  }

  const userId = c.get('userId');

  try {
    const db = getDb(c);

    // Verify post exists
    const post = await db
      .prepare('SELECT id FROM posts WHERE id = ?')
      .bind(postId)
      .first<PostRecord>();

    if (!post) {
      return c.json(
        { error: '404_POST_NOT_FOUND', message: 'Target post not found' },
        404
      );
    }

    const commentId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO comments (id, post_id, user_id, parent_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(commentId, postId, userId, parent_id || null, content.trim(), createdAt)
      .run();

    return c.json(
      {
        id: commentId,
        post_id: postId,
        user_id: userId,
        parent_id: parent_id || null,
        content: content.trim(),
        created_at: createdAt,
      },
      201
    );
  } catch (err: any) {
    console.error('Database error in POST /comments:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to add comment' },
      500
    );
  }
});

// GET /api/v1/posts/:postId/comments - List comments for a post
commentsRoute.get('/posts/:postId/comments', optionalAuth, async (c) => {
  const postId = c.req.param('postId');

  try {
    const db = getDb(c);
    const res = await db
      .prepare(
        'SELECT id, post_id, user_id, parent_id, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC'
      )
      .bind(postId)
      .all<CommentRecord>();

    return c.json({ comments: res.results || [] }, 200);
  } catch (err: any) {
    console.error('Database error in GET /comments:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to retrieve comments' },
      500
    );
  }
});
