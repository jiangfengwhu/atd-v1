-- Incremental idempotent schema for post metrics (views, bookmarks, shares) and user bookmarks

CREATE TABLE IF NOT EXISTS post_metrics (
  post_id TEXT PRIMARY KEY,
  views_count INTEGER NOT NULL DEFAULT 0,
  bookmarks_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_bookmarks_user_created
  ON post_bookmarks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_bookmarks_post
  ON post_bookmarks (post_id);
