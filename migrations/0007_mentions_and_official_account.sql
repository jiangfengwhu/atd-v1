-- Incremental idempotent schema for @mentions and official feedback account

CREATE TABLE IF NOT EXISTS official_accounts (
  user_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  badge_label TEXT NOT NULL DEFAULT '官方',
  description TEXT NOT NULL DEFAULT '',
  is_feedback_account INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_mentions (
  post_id TEXT NOT NULL,
  mentioned_user_id TEXT NOT NULL,
  matched_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_mentions_user_created
  ON post_mentions (mentioned_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_mentions_post
  ON post_mentions (post_id);

INSERT OR IGNORE INTO users (id, email, nickname, avatar_seed, created_at, updated_at)
VALUES (
  'official_feedback',
  'official_feedback@system.local',
  '官方反馈',
  'official_feedback',
  '2025-01-01T00:00:00.000Z',
  '2025-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO user_profiles (user_id, avatar_url, bio, updated_at)
VALUES (
  'official_feedback',
  '',
  'dev社区官方反馈与建议受理账号，发帖 @官方反馈 即可提交产品建议或问题反馈。',
  '2025-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO official_accounts (user_id, handle, badge_label, description, is_feedback_account, created_at)
VALUES (
  'official_feedback',
  'official_feedback',
  '官方',
  'dev社区官方反馈账号',
  1,
  '2025-01-01T00:00:00.000Z'
);
