import type { MentionCandidateItem, PostMentionItem } from '@/lib/api';

const URL_MASK_PATTERN = /https?:\/\/[^\s<>"'`\u3000-\u303f\u4e00-\u9fa5\uff00-\uffef]+/gi;
const MENTION_TRIGGER_PATTERN = /(?:^|(?<![a-zA-Z0-9._%+-/@]))@([\u4e00-\u9fa5a-zA-Z0-9_-]{0,30})$/;
const MENTION_TOKEN_PATTERN =
  /(?:^|(?<![a-zA-Z0-9._%+-/@]))@([\u4e00-\u9fa5a-zA-Z0-9_-]{1,30})(?!\.[a-zA-Z0-9])/g;

export const OFFICIAL_MENTION_ALIASES = new Set([
  'official_feedback',
  '官方反馈',
  '官方',
  '官方账号',
  'official',
]);

export interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; raw: string; mention: PostMentionItem };

export type EditorMentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; raw: string; token: string; candidate: MentionCandidateItem | null };

/**
 * Detect an active @mention query right before the textarea caret.
 * Ignores email prefixes like "user@" or URL paths like "https://x.com/@".
 */
export function extractMentionTriggerBeforeCaret(
  content: string,
  caretPos: number
): MentionTrigger | null {
  if (caretPos < 1 || caretPos > content.length) return null;
  const beforeCaret = content.slice(0, caretPos);
  const match = MENTION_TRIGGER_PATTERN.exec(beforeCaret);
  if (!match) return null;
  const query = match[1] ?? '';
  const start = caretPos - query.length - 1;
  if (start < 0 || content[start] !== '@') return null;
  return {
    start,
    end: caretPos,
    query,
  };
}

/**
 * Extract unique @mention candidate tokens from editor text while ignoring URLs and emails.
 */
export function extractMentionTokens(content: string): string[] {
  if (!content) return [];
  const sanitized = content.replace(URL_MASK_PATTERN, (m) => ' '.repeat(m.length));
  const seenLower = new Set<string>();
  const tokens: string[] = [];

  MENTION_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_PATTERN.exec(sanitized)) !== null) {
    const token = match[1]?.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    tokens.push(token);
    if (tokens.length >= 20) break;
  }
  return tokens;
}

/**
 * Split editor text for synchronized mention highlighting without altering character metrics.
 * Masks URLs before scanning so URL paths containing "@" are never mis-highlighted.
 */
export function splitEditorTextByMentions(
  content: string,
  resolvedLookup: ReadonlyMap<string, MentionCandidateItem>
): EditorMentionSegment[] {
  if (!content) return [];
  const masked = content.replace(URL_MASK_PATTERN, (m) => ' '.repeat(m.length));

  const segments: EditorMentionSegment[] = [];
  MENTION_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_TOKEN_PATTERN.exec(masked)) !== null) {
    const token = match[1]?.trim();
    if (!token) continue;

    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }

    const raw = content.slice(match.index, match.index + match[0].length);
    const candidate = resolvedLookup.get(token.toLowerCase()) ?? null;
    segments.push({
      type: 'mention',
      raw,
      token,
      candidate,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Split plain text into plain segments and resolved clickable @mention segments.
 * Unresolved @tokens and email addresses remain untouched plain text.
 */
export function splitContentByMentions(
  content: string,
  mentions?: PostMentionItem[]
): MentionSegment[] {
  if (!content) return [];
  if (!mentions || mentions.length === 0) {
    return [{ type: 'text', value: content }];
  }

  const lookup = new Map<string, PostMentionItem>();
  for (const item of mentions) {
    if (item.matchedText) {
      lookup.set(item.matchedText.toLowerCase(), item);
    }
    if (item.nickname) {
      lookup.set(item.nickname.toLowerCase(), item);
    }
    if (item.isOfficial) {
      for (const alias of OFFICIAL_MENTION_ALIASES) {
        lookup.set(alias, item);
      }
    }
  }

  const segments: MentionSegment[] = [];
  MENTION_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_TOKEN_PATTERN.exec(content)) !== null) {
    const token = match[1]?.trim();
    if (!token) continue;
    const resolved = lookup.get(token.toLowerCase());
    if (!resolved) continue;

    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'mention',
      raw: match[0],
      mention: resolved,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return segments;
}
