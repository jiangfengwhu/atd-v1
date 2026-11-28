-- Incremental idempotent schema for sharing posts via direct messages

CREATE TABLE IF NOT EXISTS direct_message_post_shares (
  message_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_post_shares_post
  ON direct_message_post_shares (post_id);
