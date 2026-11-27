-- Incremental idempotent schema for feedback tickets and admin comment status transitions

CREATE TABLE IF NOT EXISTS feedback_tickets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE,
  author_id TEXT NOT NULL,
  official_user_id TEXT NOT NULL DEFAULT 'official_feedback',
  feedback_queue_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  status_note TEXT NOT NULL DEFAULT '',
  last_reply_comment_id TEXT,
  updated_by_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_tickets_post
  ON feedback_tickets (post_id);

CREATE INDEX IF NOT EXISTS idx_feedback_tickets_status_created
  ON feedback_tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_tickets_author_created
  ON feedback_tickets (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_ticket_events (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE,
  ticket_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comment_ticket_events_comment
  ON comment_ticket_events (comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_ticket_events_post_created
  ON comment_ticket_events (post_id, created_at ASC);
