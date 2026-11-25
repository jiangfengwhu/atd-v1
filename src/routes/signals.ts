import { Hono } from 'hono';
import type { AppEnv, Bindings } from '../types';
import { getSessionUser } from './auth';

export const signalsRoutes = new Hono<AppEnv>();

const ALLOWED_FEEDBACK_CATEGORIES = new Set(['feature', 'ux', 'bug', 'other']);
const APP_VERSION = '1.0.0';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length || aBytes.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function isAuthorizedSyncRequest(env: Bindings, headerToken: string | undefined): { ok: boolean; status: 401 | 503 } {
  const expected = (env.AUTODEV_INGEST_TOKEN || '').trim();
  if (!expected) {
    return { ok: false, status: 503 };
  }
  const provided = (headerToken || '').trim();
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return { ok: false, status: 401 };
  }
  return { ok: true, status: 401 };
}

function sanitizeText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/\u0000/g, '').trim().slice(0, maxLen);
}

function sanitizeRoute(val: unknown): string {
  const raw = sanitizeText(val, 200);
  if (!raw) return '/';
  if (raw.startsWith('/')) return raw;
  try {
    return new URL(raw).pathname.slice(0, 200) || '/';
  } catch {
    return '/' + raw.slice(0, 199);
  }
}

function isClientNoiseError(message: string, stack: string): boolean {
  const combined = (message + ' ' + stack).toLowerCase();
  if (
    combined.includes('chrome-extension://') ||
    combined.includes('moz-extension://') ||
    combined.includes('safari-extension://') ||
    combined.includes('resizeobserver loop') ||
    combined.includes('script error.')
  ) {
    return true;
  }
  return false;
}

function resolveAutoDevStudioBaseUrl(env: Bindings): string | null {
  const raw = (env.AUTODEV_STUDIO_URL || '').trim().replace(/\/+$/, '');
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw;
}

async function tryPushToAutoDevStudio(params: {
  env: Bindings;
  endpointPath: '/api/ingest/feedback' | '/api/ingest/errors';
  table: 'autodev_feedback_queue' | 'autodev_error_queue';
  rowId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const studioUrl = resolveAutoDevStudioBaseUrl(params.env);
  const token = (params.env.AUTODEV_INGEST_TOKEN || '').trim();
  if (!studioUrl || !token) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${studioUrl}${params.endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AutoDev-Ingest-Token': token,
      },
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });
    if (res.ok) {
      await params.env.DB.prepare(
        `UPDATE ${params.table} SET synced = 1 WHERE id = ?`
      )
        .bind(params.rowId)
        .run();
    }
  } catch {
    // Zero-loss fallback: row stays synced = 0 in D1 and will be pulled by AutoDev Studio
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCallerHash(
  db: Bindings['DB'],
  cookieHeader: string | undefined,
  clientIp: string | undefined
): Promise<string> {
  try {
    const user = await getSessionUser(db, cookieHeader);
    if (user?.id) {
      return (await sha256Hex(`user:${user.id}`)).slice(0, 24);
    }
  } catch {
    // ignore session lookup failure
  }
  const ip = (clientIp || 'unknown').trim();
  return (await sha256Hex(`ip:${ip}`)).slice(0, 24);
}

/**
 * Public user feedback submission endpoint (persists to D1 + async push to AutoDev Studio).
 */
signalsRoutes.post('/feedback', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: '请求格式无效' }, 400);
  }

  const content = sanitizeText(body.content, 1500);
  if (content.length < 4) {
    return c.json({ error: '请至少输入 4 个字的反馈内容' }, 400);
  }

  const rawCategory = sanitizeText(body.category, 32).toLowerCase();
  const category = ALLOWED_FEEDBACK_CATEGORIES.has(rawCategory) ? rawCategory : 'feature';
  const pageRoute = sanitizeRoute(body.pageRoute);
  const appVersion = sanitizeText(body.appVersion, 32) || APP_VERSION;

  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for');
  const userHash = await resolveCallerHash(c.env.DB, c.req.header('cookie'), clientIp);

  // Per-caller rate limit: max 8 feedback items per 10 minutes
  const windowIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rateRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM autodev_feedback_queue WHERE user_hash = ? AND created_at >= ?'
  )
    .bind(userHash, windowIso)
    .first<{ cnt: number }>();

  if ((rateRow?.cnt ?? 0) >= 8) {
    return c.json({ error: '提交过于频繁，请稍后再试' }, 429);
  }

  const id = `fb_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const createdAt = new Date().toISOString();
  const metadata = {
    sourceApp: 'atd-v1-community',
    userAgent: sanitizeText(c.req.header('user-agent'), 180),
  };

  await c.env.DB.prepare(
    `INSERT INTO autodev_feedback_queue
      (id, content, category, page_route, user_hash, app_version, metadata_json, synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(
      id,
      content,
      category,
      pageRoute,
      userHash,
      appVersion,
      JSON.stringify(metadata),
      createdAt
    )
    .run();

  const pushPayload = {
    content,
    category,
    pageRoute,
    userId: userHash,
    appVersion,
    metadata,
  };

  try {
    c.executionCtx.waitUntil(
      tryPushToAutoDevStudio({
        env: c.env,
        endpointPath: '/api/ingest/feedback',
        table: 'autodev_feedback_queue',
        rowId: id,
        payload: pushPayload,
      })
    );
  } catch {
    // executionCtx unavailable in unit/local test environments
  }

  return c.json({ ok: true, id, message: '反馈已收到，感谢你的建议' }, 201);
});

/**
 * Public frontend runtime error collector (persists to D1 + async push to AutoDev Studio).
 */
signalsRoutes.post('/client-errors', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ ok: false }, 400);
  }

  const errorName = sanitizeText(body.errorName, 120) || 'Error';
  const message = sanitizeText(body.message, 1500);
  const stack = sanitizeText(body.stack, 6000);
  if (!message) {
    return c.json({ ok: false, error: 'Missing error message' }, 400);
  }

  if (isClientNoiseError(message, stack)) {
    return c.json({ ok: true, ignored: true });
  }

  const route = sanitizeRoute(body.route);
  const appVersion = sanitizeText(body.appVersion, 32) || APP_VERSION;
  const environment = sanitizeText(body.environment, 32) || 'production';
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for');
  const userHash = await resolveCallerHash(c.env.DB, c.req.header('cookie'), clientIp);

  // Per-caller rate limit: max 25 client errors per 5 minutes
  const windowIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rateRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM autodev_error_queue WHERE user_hash = ? AND created_at >= ?'
  )
    .bind(userHash, windowIso)
    .first<{ cnt: number }>();

  if ((rateRow?.cnt ?? 0) >= 25) {
    return c.json({ ok: true, throttled: true });
  }

  const id = `err_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const createdAt = new Date().toISOString();
  const metadata = {
    sourceApp: 'atd-v1-community',
    userAgent: sanitizeText(c.req.header('user-agent'), 180),
  };

  await c.env.DB.prepare(
    `INSERT INTO autodev_error_queue
      (id, source, error_name, message, stack, route, http_status, app_version, environment, user_hash, metadata_json, synced, created_at)
     VALUES (?, 'frontend', ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?)`
  )
    .bind(
      id,
      errorName,
      message,
      stack,
      route,
      appVersion,
      environment,
      userHash,
      JSON.stringify(metadata),
      createdAt
    )
    .run();

  const pushPayload = {
    source: 'frontend',
    errorName,
    message,
    stack,
    route,
    appVersion,
    environment,
    userId: userHash,
    metadata,
  };

  try {
    c.executionCtx.waitUntil(
      tryPushToAutoDevStudio({
        env: c.env,
        endpointPath: '/api/ingest/errors',
        table: 'autodev_error_queue',
        rowId: id,
        payload: pushPayload,
      })
    );
  } catch {
    // executionCtx unavailable
  }

  return c.json({ ok: true, id }, 202);
});

/**
 * Captures unhandled Cloudflare Worker 5xx errors into D1 buffer + pushes to AutoDev Studio.
 */
export function captureServerErrorToAutoDev(params: {
  env: Bindings;
  executionCtx?: { waitUntil(promise: Promise<unknown>): void };
  err: Error;
  reqUrl: string;
}): void {
  const work = (async () => {
    try {
      const id = `err_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const createdAt = new Date().toISOString();
      const errorName = sanitizeText(params.err?.name, 120) || 'WorkerError';
      const message = sanitizeText(params.err?.message || String(params.err), 1500) || 'Unhandled Worker error';
      const stack = sanitizeText(params.err?.stack, 6000);
      const route = sanitizeRoute(params.reqUrl);
      const metadata = { sourceApp: 'atd-v1-community' };

      await params.env.DB.prepare(
        `INSERT INTO autodev_error_queue
          (id, source, error_name, message, stack, route, http_status, app_version, environment, user_hash, metadata_json, synced, created_at)
         VALUES (?, 'backend', ?, ?, ?, ?, 500, ?, 'production', 'worker', ?, 0, ?)`
      )
        .bind(
          id,
          errorName,
          message,
          stack,
          route,
          APP_VERSION,
          JSON.stringify(metadata),
          createdAt
        )
        .run();

      await tryPushToAutoDevStudio({
        env: params.env,
        endpointPath: '/api/ingest/errors',
        table: 'autodev_error_queue',
        rowId: id,
        payload: {
          source: 'backend',
          errorName,
          message,
          stack,
          route,
          httpStatus: 500,
          appVersion: APP_VERSION,
          environment: 'production',
          metadata,
        },
      });
    } catch {
      // Never cascade error inside global onError handler
    }
  })();

  try {
    params.executionCtx?.waitUntil(work);
  } catch {
    void work;
  }
}

/**
 * Authenticated pull endpoint for AutoDev Studio zero-loss sync.
 */
signalsRoutes.get('/signals/pull', async (c) => {
  const auth = isAuthorizedSyncRequest(c.env, c.req.header('x-autodev-ingest-token'));
  if (!auth.ok) {
    return c.json({ error: auth.status === 503 ? 'Sync token not configured' : 'Unauthorized' }, auth.status);
  }

  const rawLimit = Number(c.req.query('limit') || '50');
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 50;

  const fbRows = await c.env.DB.prepare(
    `SELECT id, content, category, page_route, user_hash, app_version, metadata_json, created_at
     FROM autodev_feedback_queue
     WHERE synced = 0
     ORDER BY created_at ASC
     LIMIT ?`
  )
    .bind(limit)
    .all<{
      id: string;
      content: string;
      category: string;
      page_route: string;
      user_hash: string;
      app_version: string;
      metadata_json: string;
      created_at: string;
    }>();

  const errRows = await c.env.DB.prepare(
    `SELECT id, source, error_name, message, stack, route, http_status, app_version, environment, user_hash, metadata_json, created_at
     FROM autodev_error_queue
     WHERE synced = 0
     ORDER BY created_at ASC
     LIMIT ?`
  )
    .bind(limit)
    .all<{
      id: string;
      source: string;
      error_name: string;
      message: string;
      stack: string;
      route: string;
      http_status: number | null;
      app_version: string;
      environment: string;
      user_hash: string;
      metadata_json: string;
      created_at: string;
    }>();

  const parseMeta = (raw: string): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  return c.json({
    ok: true,
    feedback: (fbRows.results || []).map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      pageRoute: row.page_route,
      userId: row.user_hash,
      appVersion: row.app_version,
      metadata: { ...parseMeta(row.metadata_json), bufferedAt: row.created_at },
    })),
    errors: (errRows.results || []).map((row) => ({
      id: row.id,
      source: row.source === 'backend' ? 'backend' : 'frontend',
      errorName: row.error_name,
      message: row.message,
      stack: row.stack,
      route: row.route,
      httpStatus: row.http_status ?? undefined,
      appVersion: row.app_version,
      environment: row.environment,
      userId: row.user_hash,
      metadata: { ...parseMeta(row.metadata_json), bufferedAt: row.created_at },
    })),
  });
});

/**
 * Authenticated ACK endpoint for AutoDev Studio zero-loss sync.
 */
signalsRoutes.post('/signals/ack', async (c) => {
  const auth = isAuthorizedSyncRequest(c.env, c.req.header('x-autodev-ingest-token'));
  if (!auth.ok) {
    return c.json({ error: auth.status === 503 ? 'Sync token not configured' : 'Unauthorized' }, auth.status);
  }

  let body: { feedbackIds?: unknown; errorIds?: unknown };
  try {
    body = (await c.req.json()) as { feedbackIds?: unknown; errorIds?: unknown };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const feedbackIds = Array.isArray(body.feedbackIds)
    ? body.feedbackIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64).slice(0, 100)
    : [];
  const errorIds = Array.isArray(body.errorIds)
    ? body.errorIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64).slice(0, 100)
    : [];

  for (const id of feedbackIds) {
    await c.env.DB.prepare('UPDATE autodev_feedback_queue SET synced = 1 WHERE id = ?')
      .bind(id)
      .run();
  }
  for (const id of errorIds) {
    await c.env.DB.prepare('UPDATE autodev_error_queue SET synced = 1 WHERE id = ?')
      .bind(id)
      .run();
  }

  // Opportunistic retention cleanup: delete synced rows older than 14 days
  const cutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare('DELETE FROM autodev_feedback_queue WHERE synced = 1 AND created_at < ?')
    .bind(cutoffIso)
    .run();
  await c.env.DB.prepare('DELETE FROM autodev_error_queue WHERE synced = 1 AND created_at < ?')
    .bind(cutoffIso)
    .run();

  return c.json({
    ok: true,
    ackedFeedback: feedbackIds.length,
    ackedErrors: errorIds.length,
  });
});
