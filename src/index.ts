import { Hono } from 'hono';
import type { Request as CfRequest } from '@cloudflare/workers-types';
import type { AppEnv } from './types';
import { authRoutes, getSessionUser } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { postRoutes } from './routes/posts';
import { uploadRoutes } from './routes/uploads';
import { userRoutes } from './routes/users';
import { messageRoutes } from './routes/messages';
import { notificationRoutes } from './routes/notifications';

export { UserRealtimeHub } from './realtime/user-hub';

const app = new Hono<AppEnv>();

function isSameOriginWebSocketRequest(reqUrlStr: string, originHeader: string, hostHeader?: string): boolean {
  try {
    const reqUrl = new URL(reqUrlStr);
    const originUrl = new URL(originHeader);
    const expectedHost = (hostHeader || reqUrl.host).toLowerCase();
    return originUrl.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

app.onError((err, c) => {
  console.error('Unhandled Worker error:', err);
  return c.json({ error: '服务器内部错误，请稍后重试' }, 500);
});

app.get('/api/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    return c.json({
      ok: true,
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return c.json({ ok: false, error: 'Database connection failed' }, 500);
  }
});

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/posts', postRoutes);
app.route('/api/uploads', uploadRoutes);
app.route('/api/users', userRoutes);
app.route('/api/messages', messageRoutes);
app.route('/api/notifications', notificationRoutes);

app.get('/api/ws', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const originHeader = c.req.header('origin');
  if (originHeader) {
    const hostHeader = c.req.header('x-forwarded-host') || c.req.header('host');
    if (!isSameOriginWebSocketRequest(c.req.url, originHeader, hostHeader)) {
      return c.json({ error: '禁止跨站 WebSocket 连接' }, 403);
    }
  }

  const upgradeHeader = c.req.header('upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected Upgrade: websocket' }, 426);
  }

  if (!c.env.USER_REALTIME) {
    return c.json({ error: '实时推送服务暂不可用' }, 503);
  }

  const stubId = c.env.USER_REALTIME.idFromName(user.id);
  const stub = c.env.USER_REALTIME.get(stubId);
  const doUrl = new URL(c.req.url);
  doUrl.pathname = '/connect';
  doUrl.searchParams.set('userId', user.id);

  const res = await stub.fetch(
    new Request(doUrl.toString(), {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
    }) as unknown as CfRequest
  );
  return res as unknown as globalThis.Response;
});

app.all('/api/*', (c) => {
  return c.json({ error: 'API route not found' }, 404);
});

app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
