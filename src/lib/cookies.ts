export const USER_SESSION_COOKIE = 'session_token';
export const ADMIN_SESSION_COOKIE = 'admin_session';

export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const val = pair.slice(idx + 1).trim();
      return val ? decodeURIComponent(val) : null;
    }
  }
  return null;
}

export function isHttpsRequest(requestUrl: string, headers: Headers): boolean {
  const proto = headers.get('x-forwarded-proto');
  if (proto) return proto.toLowerCase() === 'https';
  try {
    return new URL(requestUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
