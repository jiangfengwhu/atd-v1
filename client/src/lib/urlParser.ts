const URL_PATTERN =
  /https?:\/\/[^\s<>"'`\u3000-\u303f\u4e00-\u9fa5\uff00-\uffef]+/gi;

const TRAILING_PUNCTUATION = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  '"',
  "'",
  '`',
  ']',
  '}',
  '>',
]);

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif)$/i;
const IMAGE_FORMAT_VALUES = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export interface ParsedUrlMeta {
  url: string;
  host: string;
  pathPreview: string;
  isImage: boolean;
}

/**
 * Trim trailing punctuation from a raw URL match while keeping balanced
 * parentheses (e.g. Wikipedia URLs like https://en.wikipedia.org/wiki/Foo_(bar)).
 */
function stripTrailingPunctuation(raw: string): string {
  let result = raw;
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (TRAILING_PUNCTUATION.has(last)) {
      result = result.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const openCount = (result.match(/\(/g) ?? []).length;
      const closeCount = (result.match(/\)/g) ?? []).length;
      if (closeCount > openCount) {
        result = result.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return result;
}

/**
 * Validate and normalize an http/https URL string. Returns null if invalid or unsafe.
 */
export function normalizeExternalUrl(raw: string): string | null {
  const cleaned = stripTrailingPunctuation(raw.trim());
  if (!cleaned || cleaned.length > 1024) return null;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      // Allow localhost for dev testing while rejecting malformed hostnames like "https://a"
      if (parsed.hostname !== 'localhost') {
        return null;
      }
    }
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Check whether a validated external URL likely points directly to a supported image.
 */
export function isLikelyImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (IMAGE_EXT_REGEX.test(parsed.pathname)) {
      return true;
    }
    const fmt = (
      parsed.searchParams.get('format') ||
      parsed.searchParams.get('fm') ||
      ''
    ).toLowerCase();
    return IMAGE_FORMAT_VALUES.has(fmt);
  } catch {
    return false;
  }
}

/**
 * Extract unique valid http/https URLs from arbitrary text (linear scan, loop-safe).
 */
export function extractUrlsFromContent(text: string, maxUrls = 8): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const normalized = normalizeExternalUrl(match[0]);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxUrls) break;
  }
  return out;
}

/**
 * Format pasted text that contains one or more URLs so URLs are cleanly separated
 * from adjacent text without altering URL contents.
 */
export function formatPastedTextWithUrls(
  pastedText: string,
  beforeChar: string,
  afterChar: string
): string {
  if (!pastedText) return pastedText;

  // Insert a space between non-whitespace text and a URL glued directly onto it
  let formatted = pastedText.replace(
    URL_PATTERN,
    (rawMatch, offset: number, full: string) => {
      const cleaned = stripTrailingPunctuation(rawMatch);
      const valid = normalizeExternalUrl(cleaned);
      if (!valid) return rawMatch;

      const trailing = rawMatch.slice(cleaned.length);
      const prevChar = offset > 0 ? full[offset - 1] : '';
      const nextChar = full[offset + rawMatch.length] ?? '';

      const needsLeadingSpace =
        prevChar !== '' && !/[\s([{"'「『（【《]/.test(prevChar);
      const needsTrailingSpace =
        trailing === '' &&
        nextChar !== '' &&
        !/[\s)\]}"'.,;:!?，。！？；：、）」』）】》]/.test(nextChar);

      return `${needsLeadingSpace ? ' ' : ''}${cleaned}${trailing}${needsTrailingSpace ? ' ' : ''}`;
    }
  );

  // Add boundary space when pasting a URL right next to existing non-whitespace content
  const trimmedStart = formatted.trimStart();
  if (
    beforeChar &&
    !/[\s([{"'「『（【《]/.test(beforeChar) &&
    /^https?:\/\//i.test(trimmedStart) &&
    formatted === trimmedStart
  ) {
    formatted = ` ${formatted}`;
  }

  const trimmedEnd = formatted.trimEnd();
  if (
    afterChar &&
    !/[\s)\]}"'.,;:!?，。！？；：、）」』）】》]/.test(afterChar) &&
    /https?:\/\/\S+$/i.test(trimmedEnd) &&
    formatted === trimmedEnd
  ) {
    formatted = `${formatted} `;
  }

  return formatted;
}

/**
 * Build compact display metadata for a detected URL chip.
 */
export function parseUrlMeta(url: string): ParsedUrlMeta {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    const rawPath = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`;
    const pathPreview =
      rawPath.length > 36 ? `${rawPath.slice(0, 36)}…` : rawPath;
    return {
      url,
      host,
      pathPreview,
      isImage: isLikelyImageUrl(url),
    };
  } catch {
    return {
      url,
      host: url,
      pathPreview: '',
      isImage: false,
    };
  }
}

export interface UrlTextPart {
  type: 'text' | 'url';
  value: string;
}

/**
 * Split content into plain text and validated http/https URL parts for safe rendering.
 */
export function splitTextByUrls(content: string): UrlTextPart[] {
  if (!content) return [];
  const parts: UrlTextPart[] = [];
  URL_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(content)) !== null) {
    const rawMatch = match[0];
    const cleaned = stripTrailingPunctuation(rawMatch);
    const valid = normalizeExternalUrl(cleaned);
    if (!valid) continue;

    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: 'url',
      value: valid,
    });

    lastIndex = match.index + cleaned.length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return parts;
}
