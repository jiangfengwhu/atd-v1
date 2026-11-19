import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { app } from './index';
import { setNodeDb } from './db';
import { createNodeSqliteAdapter } from './db/node-sqlite';

// Ensure dist directory exists
const distDir = path.resolve(process.cwd(), 'dist');
const indexHtml = path.resolve(distDir, 'index.html');
if (!fs.existsSync(indexHtml)) {
  console.log('dist/index.html not found, building frontend assets...');
  try {
    execSync('npm run build:client', { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to auto-build client:', err);
  }
}

// Initialize SQLite database
const dbPath = path.resolve(process.cwd(), '.dev.db');
const nodeDb = createNodeSqliteAdapter(dbPath);
setNodeDb(nodeDb);

// Run migrations on startup
const migrationsDir = path.resolve(process.cwd(), 'migrations');
if (fs.existsSync(migrationsDir)) {
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    nodeDb.exec(sql);
  }
  console.log(`Applied ${migrationFiles.length} migration(s).`);
}

// Serve static assets from ./dist
app.use(
  '/*',
  serveStatic({
    root: './dist',
  })
);

// SPA fallback for client routing
app.get('*', (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: '404_NOT_FOUND', message: 'API route not found' }, 404);
  }

  if (fs.existsSync(indexHtml)) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    return c.html(html);
  }

  return c.text('Frontend is not built. Please run npm run build.', 404);
});

const PORT = 8787;
serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`🚀 Server ready and listening on http://127.0.0.1:${info.port}`);
  }
);
