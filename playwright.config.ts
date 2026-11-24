import fs from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

function resolveChromiumExecutable(): string | undefined {
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      return undefined;
    }
  } catch {
    // Fall back to system Chromium binary when Playwright browser cache is absent
  }

  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter((p): p is string => Boolean(p));

  return candidates.find((p) => fs.existsSync(p));
}

const fallbackExecutablePath = resolveChromiumExecutable();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'on-first-retry',
    ...(fallbackExecutablePath
      ? { launchOptions: { executablePath: fallbackExecutablePath } }
      : {}),
  },
  webServer: {
    command:
      'npm run build:client && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port 8787 --ip 127.0.0.1',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
