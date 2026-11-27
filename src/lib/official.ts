import type { D1Database } from '@cloudflare/workers-types';

export const OFFICIAL_FEEDBACK_USER_ID = 'official_feedback';
export const OFFICIAL_FEEDBACK_EMAIL = 'official_feedback@system.local';
export const OFFICIAL_FEEDBACK_NICKNAME = '官方反馈';
export const OFFICIAL_FEEDBACK_HANDLE = 'official_feedback';
export const OFFICIAL_FEEDBACK_BADGE = '官方';
export const OFFICIAL_FEEDBACK_BIO =
  'dev社区官方反馈与建议受理账号，发帖 @官方反馈 即可提交产品建议或问题反馈。';

export const OFFICIAL_FEEDBACK_ALIASES = [
  OFFICIAL_FEEDBACK_USER_ID.toLowerCase(),
  OFFICIAL_FEEDBACK_HANDLE.toLowerCase(),
  OFFICIAL_FEEDBACK_NICKNAME.toLowerCase(),
  '官方',
  '官方账号',
  'official',
];

const RESERVED_OFFICIAL_NAMES = new Set(OFFICIAL_FEEDBACK_ALIASES);

/**
 * Check if a requested nickname collides with a reserved official account identifier.
 */
export function isReservedOfficialNickname(nickname: string): boolean {
  const normalized = nickname.trim().toLowerCase();
  if (!normalized) return false;
  return RESERVED_OFFICIAL_NAMES.has(normalized);
}

/**
 * Check whether an email belongs to an official system account that must not log in via OTP.
 */
export async function isOfficialAccountEmail(db: D1Database, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === OFFICIAL_FEEDBACK_EMAIL) return true;

  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM users u
       JOIN official_accounts oa ON oa.user_id = u.id
       WHERE LOWER(u.email) = ?
       LIMIT 1`
    )
    .bind(normalized)
    .first<{ ok: number }>();

  return Boolean(row?.ok);
}

/**
 * Check whether a user ID belongs to an official system account.
 */
export async function isOfficialUserId(db: D1Database, userId: string): Promise<boolean> {
  if (!userId) return false;
  if (userId === OFFICIAL_FEEDBACK_USER_ID) return true;
  const row = await db
    .prepare('SELECT 1 AS ok FROM official_accounts WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

/**
 * Ensure the official feedback account exists idempotently in D1.
 */
export async function ensureOfficialFeedbackAccount(db: D1Database): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT u.id
       FROM users u
       JOIN official_accounts oa ON oa.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`
    )
    .bind(OFFICIAL_FEEDBACK_USER_ID)
    .first<{ id: string }>();

  if (existing) return;

  const seedTimestamp = '2025-01-01T00:00:00.000Z';
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO users (id, email, nickname, avatar_seed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        OFFICIAL_FEEDBACK_USER_ID,
        OFFICIAL_FEEDBACK_EMAIL,
        OFFICIAL_FEEDBACK_NICKNAME,
        OFFICIAL_FEEDBACK_HANDLE,
        seedTimestamp,
        seedTimestamp
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO user_profiles (user_id, avatar_url, bio, updated_at)
         VALUES (?, '', ?, ?)`
      )
      .bind(OFFICIAL_FEEDBACK_USER_ID, OFFICIAL_FEEDBACK_BIO, seedTimestamp),
    db
      .prepare(
        `INSERT OR IGNORE INTO official_accounts (user_id, handle, badge_label, description, is_feedback_account, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .bind(
        OFFICIAL_FEEDBACK_USER_ID,
        OFFICIAL_FEEDBACK_HANDLE,
        OFFICIAL_FEEDBACK_BADGE,
        'dev社区官方反馈账号',
        seedTimestamp
      ),
  ]);
}
