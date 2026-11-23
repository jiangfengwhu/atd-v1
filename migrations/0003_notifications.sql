-- Incremental idempotent schema for notifications

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comment', 'like', 'follow')),
  post_id TEXT,
  comment_id TEXT,
  content_preview TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_created
  ON notifications (recipient_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_post_id
  ON notifications (post_id);

CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications (recipient_id, actor_id, type, post_id, is_read);
