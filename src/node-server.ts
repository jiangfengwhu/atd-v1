import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { app } from './index';
import { setNodeDb } from './db';
import { createNodeSqliteAdapter } from './db/node-sqlite';
import { isStaticAssetFilePath } from './utils/routing';

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

async function runMigrations() {
  await nodeDb.exec('PRAGMA foreign_keys = ON;');
  await nodeDb.exec(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of migrationFiles) {
    const existing = await nodeDb
      .prepare('SELECT name FROM _applied_migrations WHERE name = ?')
      .bind(file)
      .first<{ name: string }>();

    if (existing) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    await nodeDb.exec(sql);
    await nodeDb
      .prepare('INSERT OR IGNORE INTO _applied_migrations (name, applied_at) VALUES (?, ?)')
      .bind(file, new Date().toISOString())
      .run();
    appliedCount++;
  }

  console.log(
    `Migrations ready (${migrationFiles.length} total, ${appliedCount} newly applied).`
  );
}

await runMigrations();

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

  if (isStaticAssetFilePath(c.req.path)) {
    return c.text('Not Found', 404);
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
