import { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { getDb } from '../db';
import { Env, AppVariables } from '../types';
import { extractBearerToken, getCookieValue, sha256Hex } from '../utils/crypto';

interface SessionLookupResult {
  userId: string;
  email: string | null;
}

async function resolveEmailSession(
  c: Context<any>,
  rawToken: string
): Promise<SessionLookupResult | null> {
  const db = getDb(c);
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  const row = await db
    .prepare(
      `SELECT s.user_id, e.email
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_auth_emails e ON e.user_id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, nowIso)
    .first<{ user_id: string; email: string | null }>();

  if (!row) return null;
  return { userId: row.user_id, email: row.email ?? null };
}

async function ensureFingerprintUser(c: Context<any>, fingerprint: string): Promise<void> {
  try {
    const db = getDb(c);
    const now = new Date().toISOString();
    await db
      .prepare('INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)')
      .bind(fingerprint, `user_${fingerprint.slice(0, 8)}`, now)
      .run();
  } catch (err) {
    console.error('Failed to ensure fingerprint user in database:', err);
  }
}

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const bearerToken = extractBearerToken(authHeader);

  // If Authorization header was explicitly supplied, strictly verify it without falling back
  if (authHeader !== undefined) {
    if (!bearerToken) {
      return c.json(
        { error: '401_UNAUTHORIZED', message: 'Invalid Authorization Bearer token' },
        401
      );
    }
    const session = await resolveEmailSession(c, bearerToken);
    if (!session) {
      return c.json(
        { error: '401_UNAUTHORIZED', message: 'Session token is invalid or expired' },
        401
      );
    }
    c.set('userId', session.userId);
    c.set('fingerprint', session.userId);
    c.set('authType', 'email');
    c.set('userEmail', session.email);
    await next();
    return;
  }

  // Check HttpOnly session_token cookie
  const cookieToken = getCookieValue(c.req.header('Cookie'), 'session_token');
  if (cookieToken) {
    const session = await resolveEmailSession(c, cookieToken);
    if (session) {
      c.set('userId', session.userId);
      c.set('fingerprint', session.userId);
      c.set('authType', 'email');
      c.set('userEmail', session.email);
      await next();
      return;
    }
  }

  // Fallback to legacy x-browser-fingerprint header
  const rawFp = c.req.header('x-browser-fingerprint');
  if (rawFp && rawFp.trim()) {
    const fingerprint = rawFp.trim();
    await ensureFingerprintUser(c, fingerprint);
    c.set('fingerprint', fingerprint);
    c.set('userId', fingerprint);
    c.set('authType', 'fingerprint');
    c.set('userEmail', null);
    await next();
    return;
  }

  return c.json(
    {
      error: '401_UNAUTHORIZED',
      message: 'Authentication required: please sign in with email or provide fingerprint',
    },
    401
  );
});

export const optionalAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const bearerToken = extractBearerToken(authHeader);

  if (bearerToken) {
    const session = await resolveEmailSession(c, bearerToken);
    if (session) {
      c.set('userId', session.userId);
      c.set('fingerprint', session.userId);
      c.set('authType', 'email');
      c.set('userEmail', session.email);
      await next();
      return;
    }
  }

  if (authHeader === undefined) {
    const cookieToken = getCookieValue(c.req.header('Cookie'), 'session_token');
    if (cookieToken) {
      const session = await resolveEmailSession(c, cookieToken);
      if (session) {
        c.set('userId', session.userId);
        c.set('fingerprint', session.userId);
        c.set('authType', 'email');
        c.set('userEmail', session.email);
        await next();
        return;
      }
    }

    const rawFp = c.req.header('x-browser-fingerprint');
    if (rawFp && rawFp.trim()) {
      const fingerprint = rawFp.trim();
      await ensureFingerprintUser(c, fingerprint);
      c.set('fingerprint', fingerprint);
      c.set('userId', fingerprint);
      c.set('authType', 'fingerprint');
      c.set('userEmail', null);
    }
  }

  await next();
});
