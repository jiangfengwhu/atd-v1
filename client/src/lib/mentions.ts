import type { PostMentionItem } from '@/lib/api';

const MENTION_TRIGGER_PATTERN = /(?:^|(?<![a-zA-Z0-9._%+-/@]))@([\u4e00-\u9fa5a-zA-Z0-9_-]{0,30})$/;
const MENTION_TOKEN_PATTERN =
  /(?:^|(?<![a-zA-Z0-9._%+-/@]))@([\u4e00-\u9fa5a-zA-Z0-9_-]{1,30})(?!\.[a-zA-Z0-9])/g;

export interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; raw: string; mention: PostMentionItem };

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
      lookup.set('official_feedback', item);
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
