// Client API utility supporting Email Session Bearer Token and browser fingerprint fallback

const AUTH_TOKEN_KEY = 'auth_token';
const ADMIN_TOKEN_KEY = 'admin_token';

export function getFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  let fp =
    localStorage.getItem('x-browser-fingerprint') ||
    localStorage.getItem('browser_fingerprint');

  if (!fp || !fp.trim()) {
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

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined' && token.trim()) {
    localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function setAdminToken(token: string): void {
  if (typeof window !== 'undefined' && token.trim()) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
  }
}

export function clearAdminToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
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
    const err = new Error(errorMsg) as Error & {
      status: number;
      code?: string;
      data: any;
    };
    err.status = res.status;
    err.code = data && typeof data === 'object' ? data.error : undefined;
    err.data = data;
    throw err;
  }

  return data as T;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const authToken = getAuthToken();

  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  } else if (!headers.has('x-browser-fingerprint')) {
    const fp = getFingerprint();
    if (fp) {
      headers.set('x-browser-fingerprint', fp);
    }
  }

  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (
    !isFormData &&
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  return parseResponse<T>(res);
}

export async function adminApiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const adminToken = getAdminToken();

  if (adminToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }

  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  return parseResponse<T>(res);
}
