import { Hono } from 'hono';
import type { AppEnv } from './types';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { postRoutes } from './routes/posts';
import { uploadRoutes } from './routes/uploads';
import { userRoutes } from './routes/users';
import { messageRoutes } from './routes/messages';

const app = new Hono<AppEnv>();

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
