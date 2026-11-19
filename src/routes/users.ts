import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth } from '../middleware/fingerprint';
import { Env, AppVariables, UserRecord } from '../types';

export const usersRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

// GET /api/v1/users/me - Current user info based on fingerprint
usersRoute.get('/users/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb(c);
    const user = await db
      .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
      .bind(userId)
      .first<UserRecord>();

    if (!user) {
      return c.json({ error: '404_USER_NOT_FOUND', message: 'User not found' }, 404);
    }

    return c.json(user, 200);
  } catch (err: any) {
    return c.json({ error: '500_DB_ERROR', message: 'Database error' }, 500);
  }
});

// GET /api/v1/users - List active community members
usersRoute.get('/users', async (c) => {
  try {
    const db = getDb(c);
    const res = await db
      .prepare('SELECT id, username, created_at FROM users ORDER BY created_at DESC LIMIT 50')
      .all<UserRecord>();

    return c.json({ users: res.results || [] }, 200);
  } catch (err: any) {
    return c.json({ error: '500_DB_ERROR', message: 'Database error' }, 500);
  }
});
