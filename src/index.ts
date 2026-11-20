import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoute } from './routes/auth';
import { adminRoute } from './routes/admin';
import { mediaRoute } from './routes/media';
import { postsRoute } from './routes/posts';
import { statsRoute } from './routes/stats';
import { messagesRoute } from './routes/messages';
import { commentsRoute } from './routes/comments';
import { usersRoute } from './routes/users';
import { Env, AppVariables } from './types';

export const app = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

// Enable CORS for API requests
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'x-browser-fingerprint', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'x-browser-fingerprint'],
    maxAge: 600,
  })
);

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Community API routes under /api/v1
app.route('/api/v1/auth', authRoute);
app.route('/api/v1/admin', adminRoute);
app.route('/api/v1', mediaRoute);
app.route('/api/v1', postsRoute);
app.route('/api/v1', statsRoute);
app.route('/api/v1', messagesRoute);
app.route('/api/v1', commentsRoute);
app.route('/api/v1', usersRoute);

// Global Error Handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: '500_DB_ERROR',
      message: err.message || 'Internal Server Error',
    },
    500
  );
});

// Custom 404 Handler for API routes
app.notFound((c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: '404_NOT_FOUND', message: 'API endpoint not found' }, 404);
  }
  return c.text('Not Found', 404);
});

export default app;
