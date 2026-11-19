import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth } from '../middleware/fingerprint';
import { Env, AppVariables, MessageRecord, UserRecord } from '../types';

export const messagesRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

// POST /api/v1/messages - Send a private message
messagesRoute.post('/messages', requireAuth, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CONTENT', message: 'Invalid JSON request body' },
      400
    );
  }

  const { recipient_id, content } = body || {};

  // Validate message content
  if (!content || typeof content !== 'string' || !content.trim()) {
    return c.json(
      {
        error: '400_INVALID_CONTENT',
        message: 'Message content cannot be empty or pure whitespace',
      },
      400
    );
  }

  // Validate recipient ID
  if (!recipient_id || typeof recipient_id !== 'string' || !recipient_id.trim()) {
    return c.json(
      {
        error: '400_INVALID_RECIPIENT',
        message: 'Recipient ID is required',
      },
      400
    );
  }

  const targetRecipientId = recipient_id.trim();
  const senderId = c.get('userId');

  try {
    const db = getDb(c);

    // Verify recipient exists
    const recipient = await db
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(targetRecipientId)
      .first<UserRecord>();

    if (!recipient) {
      return c.json(
        {
          error: '404_USER_NOT_FOUND',
          message: `User with id ${targetRecipientId} not found`,
        },
        404
      );
    }

    const messageId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO messages (id, sender_id, recipient_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(messageId, senderId, targetRecipientId, content.trim(), createdAt)
      .run();

    return c.json(
      {
        message_id: messageId,
      },
      201
    );
  } catch (err: any) {
    console.error('Database error in POST /messages:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to send message' },
      500
    );
  }
});

// GET /api/v1/messages - List messages for the authenticated user
messagesRoute.get('/messages', requireAuth, async (c) => {
  const userId = c.get('userId');
  const withUser = c.req.query('with_user');

  try {
    const db = getDb(c);
    let rows: MessageRecord[] = [];

    if (withUser && withUser.trim()) {
      const targetUser = withUser.trim();
      const res = await db
        .prepare(
          'SELECT id, sender_id, recipient_id, content, created_at FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY created_at ASC'
        )
        .bind(userId, targetUser, targetUser, userId)
        .all<MessageRecord>();
      rows = res.results || [];
    } else {
      const res = await db
        .prepare(
          'SELECT id, sender_id, recipient_id, content, created_at FROM messages WHERE sender_id = ? OR recipient_id = ? ORDER BY created_at DESC'
        )
        .bind(userId, userId)
        .all<MessageRecord>();
      rows = res.results || [];
    }

    return c.json({ messages: rows }, 200);
  } catch (err: any) {
    console.error('Database error in GET /messages:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to retrieve messages' },
      500
    );
  }
});
