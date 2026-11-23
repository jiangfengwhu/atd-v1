export const USER_SESSION_COOKIE = 'session_token';
export const USER_SESSION_VAULT_COOKIE = 'session_vault';
export const ADMIN_SESSION_COOKIE = 'admin_session';
export const MAX_VAULT_SESSIONS = 5;

export function parseSessionVaultCookie(cookieHeader: string | undefined): string[] {
  const raw = getCookieValue(cookieHeader, USER_SESSION_VAULT_COOKIE);
  if (!raw) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of raw.split('|')) {
    const trimmed = part.trim();
    if (/^[a-f0-9]{32,128}$/i.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      tokens.push(trimmed);
      if (tokens.length >= MAX_VAULT_SESSIONS) break;
    }
  }
  return tokens;
}

export function serializeSessionVault(tokens: string[]): string {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (/^[a-f0-9]{32,128}$/i.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      clean.push(trimmed);
      if (clean.length >= MAX_VAULT_SESSIONS) break;
    }
  }
  return clean.join('|');
}

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
