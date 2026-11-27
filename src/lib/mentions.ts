import type { D1Database } from '@cloudflare/workers-types';
import { ensureOfficialFeedbackAccount } from './official';

const URL_MASK_PATTERN = /https?:\/\/[^\s<>"'`\u3000-\u303f\u4e00-\u9fa5\uff00-\uffef]+/gi;
const MENTION_PATTERN =
  /(?:^|(?<![a-zA-Z0-9._%+-/@]))@([\u4e00-\u9fa5a-zA-Z0-9_-]{1,30})(?!\.[a-zA-Z0-9])/g;

const MAX_MENTIONS_PER_POST = 20;

export interface ResolvedMention {
  userId: string;
  nickname: string;
  matchedText: string;
  isOfficial: boolean;
  officialBadge?: string;
}

interface MentionUserLookupRow {
  id: string;
  nickname: string;
  is_official: number;
  official_badge: string;
  official_handle: string;
}

/**
 * Extract unique @mention candidate tokens from post content while ignoring
 * email addresses (e.g. user@example.com), URLs, and domain-like tokens.
 */
export function extractMentionTokens(content: string): string[] {
  if (!content) return [];
  const sanitized = content.replace(URL_MASK_PATTERN, (m) => ' '.repeat(m.length));
  const seenLower = new Set<string>();
  const tokens: string[] = [];

  MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(sanitized)) !== null) {
    const token = match[1].trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    tokens.push(token);
    if (tokens.length >= MAX_MENTIONS_PER_POST) break;
  }

  return tokens;
}

/**
 * Resolve extracted @mention tokens against existing users and official account handles.
 * Unknown tokens are safely ignored.
 */
export async function resolveMentionedUsers(
  db: D1Database,
  tokens: string[]
): Promise<ResolvedMention[]> {
  if (tokens.length === 0) return [];

  await ensureOfficialFeedbackAccount(db);

  const loweredTokens = Array.from(new Set(tokens.map((t) => t.toLowerCase())));
  const placeholders = loweredTokens.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT u.id, u.nickname,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
              COALESCE(oa.badge_label, '') AS official_badge,
              COALESCE(oa.handle, '') AS official_handle
       FROM users u
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       WHERE LOWER(u.nickname) IN (${placeholders})
          OR LOWER(COALESCE(oa.handle, '')) IN (${placeholders})
       ORDER BY is_official DESC, u.created_at ASC`
    )
    .bind(...loweredTokens, ...loweredTokens)
    .all<MentionUserLookupRow>();

  const candidates = rows.results ?? [];
  if (candidates.length === 0) return [];

  const resolved: ResolvedMention[] = [];
  const seenUserIds = new Set<string>();

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const exactMatch = candidates.find(
      (c) => c.nickname === token || (c.official_handle && c.official_handle === token)
    );
    const ciMatch =
      exactMatch ??
      candidates.find(
        (c) =>
          c.nickname.toLowerCase() === lower ||
          (c.official_handle && c.official_handle.toLowerCase() === lower)
      );

    if (!ciMatch || seenUserIds.has(ciMatch.id)) continue;
    seenUserIds.add(ciMatch.id);

    const isOfficial = Boolean(ciMatch.is_official);
    resolved.push({
      userId: ciMatch.id,
      nickname: ciMatch.nickname,
      matchedText: token,
      isOfficial,
      ...(isOfficial ? { officialBadge: ciMatch.official_badge || '官方' } : {}),
    });
  }

  return resolved;
}

/**
 * Batch-load resolved mentions for a list of post IDs.
 */
export async function fetchMentionsForPostIds(
  db: D1Database,
  postIds: string[]
): Promise<Map<string, ResolvedMention[]>> {
  const result = new Map<string, ResolvedMention[]>();
  if (postIds.length === 0) return result;

  const uniqueIds = Array.from(new Set(postIds));
  const placeholders = uniqueIds.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT pm.post_id, pm.mentioned_user_id, pm.matched_text,
              u.nickname,
              CASE WHEN oa.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_official,
              COALESCE(oa.badge_label, '') AS official_badge
       FROM post_mentions pm
       JOIN users u ON u.id = pm.mentioned_user_id
       LEFT JOIN official_accounts oa ON oa.user_id = u.id
       WHERE pm.post_id IN (${placeholders})
       ORDER BY is_official DESC, pm.created_at ASC`
    )
    .bind(...uniqueIds)
    .all<{
      post_id: string;
      mentioned_user_id: string;
      matched_text: string;
      nickname: string;
      is_official: number;
      official_badge: string;
    }>();

  for (const row of rows.results ?? []) {
    const isOfficial = Boolean(row.is_official);
    const list = result.get(row.post_id) ?? [];
    list.push({
      userId: row.mentioned_user_id,
      nickname: row.nickname,
      matchedText: row.matched_text || row.nickname,
      isOfficial,
      ...(isOfficial ? { officialBadge: row.official_badge || '官方' } : {}),
    });
    result.set(row.post_id, list);
  }

  return result;
}
