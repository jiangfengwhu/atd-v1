import { createMiddleware } from 'hono/factory';
import { getDb } from '../db';
import { Env, AppVariables } from '../types';

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const rawFp = c.req.header('x-browser-fingerprint');
  if (!rawFp || !rawFp.trim()) {
    return c.json(
      {
        error: '401_UNAUTHORIZED',
        message: 'Authentication required: browser fingerprint missing or invalid',
      },
      401
    );
  }

  const fingerprint = rawFp.trim();
  c.set('fingerprint', fingerprint);
  c.set('userId', fingerprint);

  try {
    const db = getDb(c);
    const now = new Date().toISOString();
    await db
      .prepare('INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)')
      .bind(fingerprint, `user_${fingerprint.slice(0, 8)}`, now)
      .run();
  } catch (err) {
    console.error('Failed to ensure user in database:', err);
  }

  await next();
});

export const optionalAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const rawFp = c.req.header('x-browser-fingerprint');
  if (rawFp && rawFp.trim()) {
    const fingerprint = rawFp.trim();
    c.set('fingerprint', fingerprint);
    c.set('userId', fingerprint);

    try {
      const db = getDb(c);
      const now = new Date().toISOString();
      await db
        .prepare('INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)')
        .bind(fingerprint, `user_${fingerprint.slice(0, 8)}`, now)
        .run();
    } catch {
      // ignore
    }
  }

  await next();
});
