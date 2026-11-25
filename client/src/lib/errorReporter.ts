const MAX_REPORTS_PER_SESSION = 10;
const DEDUP_WINDOW_MS = 60_000;

let installed = false;
let sessionCount = 0;
const recentSignatures = new Map<string, number>();

export interface ClientErrorReport {
  errorName: string;
  message: string;
  stack?: string;
  route?: string;
}

function isIgnoredClientNoise(message: string, stack: string): boolean {
  const hay = (message + ' ' + stack).toLowerCase();
  return (
    hay.includes('chrome-extension://') ||
    hay.includes('moz-extension://') ||
    hay.includes('safari-extension://') ||
    hay.includes('resizeobserver loop') ||
    hay === 'script error.'
  );
}

export function reportClientError(input: ClientErrorReport): void {
  try {
    if (sessionCount >= MAX_REPORTS_PER_SESSION) return;
    const errorName = (input.errorName || 'Error').trim().slice(0, 120);
    const message = (input.message || '').trim().slice(0, 1500);
    const stack = (input.stack || '').trim().slice(0, 6000);
    if (!message || isIgnoredClientNoise(message, stack)) return;

    const route = input.route || window.location.pathname || '/';
    const signature = `${errorName}|${message.slice(0, 160)}|${route}`;
    const now = Date.now();
    const lastSent = recentSignatures.get(signature) ?? 0;
    if (now - lastSent < DEDUP_WINDOW_MS) return;

    recentSignatures.set(signature, now);
    sessionCount += 1;

    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        errorName,
        message,
        stack,
        route,
        appVersion: '1.0.0',
        environment: 'production',
      }),
    }).catch(() => {
      // Never loop errors when reporting fails
    });
  } catch {
    // ignore
  }
}

export function installGlobalErrorReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined;
    reportClientError({
      errorName: err?.name || 'RuntimeError',
      message: event.message || err?.message || 'Unhandled window error',
      stack: err?.stack || (event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : ''),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const isErr = reason instanceof Error;
    reportClientError({
      errorName: isErr ? reason.name || 'UnhandledRejection' : 'UnhandledRejection',
      message: isErr
        ? reason.message || 'Unhandled promise rejection'
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection',
      stack: isErr ? reason.stack || '' : '',
    });
  });
}
