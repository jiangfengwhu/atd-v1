const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOAD_PATH_REGEX = /^\/api\/uploads\/[a-zA-Z0-9_-]{6,80}$/;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length >= 3 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

export function isValidFromEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (EMAIL_REGEX.test(trimmed)) return true;
  // Support "Display Name <email@domain.com>"
  const bracketMatch = trimmed.match(/^[^<>]{1,80}<([^<>]+)>$/);
  return Boolean(bracketMatch && EMAIL_REGEX.test(bracketMatch[1].trim()));
}

export function isValidImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.length > 1024) return false;
  if (UPLOAD_PATH_REGEX.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const HASHTAG_PATTERN = /(?:^|(?<![a-zA-Z0-9_/]))#([\u4e00-\u9fa5a-zA-Z0-9_-]+)/g;

export function extractHashtagsFromContent(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  HASHTAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_PATTERN.exec(content)) !== null) {
    const clean = match[1].trim().slice(0, 20);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

export function mergePostTags(content: string, extraTags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of [...extractHashtagsFromContent(content), ...extraTags]) {
    const clean = tag.trim().replace(/^#+/, '').slice(0, 20);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

export function makeContentPreview(content: string, maxLength = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

export function sanitizeTags(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return null;
    const clean = item.trim().replace(/^#+/, '').slice(0, 20);
    if (!clean) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= 8) break;
    }
  }
  return out;
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export function detectImageMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function escapeSqlLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
