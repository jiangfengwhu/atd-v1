const HASHTAG_PATTERN = /(?:^|(?<![a-zA-Z0-9_/]))#([\u4e00-\u9fa5a-zA-Z0-9_-]+)/g;

export interface ContentSegment {
  type: 'text' | 'tag';
  value: string;
  raw: string;
}

/**
 * Extract unique #hashtag names from post content (max 8, max 20 chars each),
 * matching the backend rule in src/lib/validation.ts.
 */
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

/**
 * Split post content into plain text and #hashtag tokens for inline interactive rendering.
 */
export function splitContentByHashtags(content: string): ContentSegment[] {
  if (!content) return [];
  const segments: ContentSegment[] = [];
  HASHTAG_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HASHTAG_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0];
    const tagRaw = match[1];
    const tagClean = tagRaw.trim().slice(0, 20);
    if (!tagClean) continue;

    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
        raw: content.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'tag',
      value: tagClean,
      raw: fullMatch,
    });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    segments.push({
      type: 'text',
      value: tail,
      raw: tail,
    });
  }

  return segments;
}
