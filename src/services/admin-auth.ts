import { createMiddleware } from 'hono/factory';
import { DatabaseAdapter, getDb } from '../db';
import { AdminUserRecord, AppVariables, Env } from '../types';
import {
  extractBearerToken,
  generateRandomToken,
  getCookieValue,
  hashPasswordPBKDF2,
  sha256Hex,
} from '../utils/crypto';

export async function ensureDefaultAdmin(db: DatabaseAdapter): Promise<void> {
  const existing = await db
    .prepare('SELECT COUNT(*) as count FROM admin_users')
    .first<{ count: number }>();

  if (existing && existing.count > 0) {
    return;
  }

  const { hash, salt } = await hashPasswordPBKDF2('admin');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_users
       (id, username, password_hash, password_salt, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(id, 'admin', hash, salt, now, now)
    .run();
}

export async function createAdminSession(
  db: DatabaseAdapter,
  adminId: string
): Promise<string> {
  const rawToken = generateRandomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at, revoked_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    )
    .bind(crypto.randomUUID(), adminId, tokenHash, expiresAt, now.toISOString())
    .run();

  return rawToken;
}

export const requireAdminAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const bearerToken = extractBearerToken(authHeader);
  const cookieToken = getCookieValue(c.req.header('Cookie'), 'admin_session');

  // If Authorization header is present, only accept that bearer token
  const rawToken = authHeader !== undefined ? bearerToken : cookieToken;

  if (!rawToken) {
    return c.json(
      { error: '401_ADMIN_UNAUTHORIZED', message: 'Admin authentication required' },
      401
    );
  }

  try {
    const db = getDb(c);
    const tokenHash = await sha256Hex(rawToken);
    const nowIso = new Date().toISOString();

    const admin = await db
      .prepare(
        `SELECT a.id, a.username, a.must_change_password
         FROM admin_sessions s
         JOIN admin_users a ON a.id = s.admin_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?
         LIMIT 1`
      )
      .bind(tokenHash, nowIso)
      .first<Pick<AdminUserRecord, 'id' | 'username' | 'must_change_password'>>();

    if (!admin) {
      return c.json(
        { error: '401_ADMIN_UNAUTHORIZED', message: 'Invalid or expired admin session' },
        401
      );
    }

    c.set('adminId', admin.id);
    c.set('adminUsername', admin.username);
    await next();
  } catch (err) {
    console.error('Admin auth error:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to verify admin session' },
      500
    );
  }
});
