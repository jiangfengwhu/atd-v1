// Client API utility with automatic browser fingerprint injection

export function getFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  let fp =
    localStorage.getItem('x-browser-fingerprint') ||
    localStorage.getItem('browser_fingerprint');

  if (!fp || !fp.trim()) {
    // Generate persistent device fingerprint
    const randomPart =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).substring(2, 12);
    fp = `fp-${randomPart}`;
    localStorage.setItem('x-browser-fingerprint', fp);
    localStorage.setItem('browser_fingerprint', fp);
  }
  return fp.trim();
}

export function setFingerprint(newFp: string): void {
  const clean = newFp.trim();
  if (clean) {
    localStorage.setItem('x-browser-fingerprint', clean);
    localStorage.setItem('browser_fingerprint', clean);
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const fp = getFingerprint();
  const headers = new Headers(options.headers || {});

  if (!headers.has('x-browser-fingerprint') && fp) {
    headers.set('x-browser-fingerprint', fp);
  }

  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const errorMsg =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      `Request failed with status ${res.status}`;
    const err = new Error(errorMsg) as Error & { status: number; data: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}
