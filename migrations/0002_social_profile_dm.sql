-- Incremental idempotent schema for social profile, follows, comment replies, and direct messages

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON user_follows (follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON user_follows (following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_replies (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  reply_to_user_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comment_replies_comment
  ON comment_replies (comment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_comment_replies_post
  ON comment_replies (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_comment_replies_author
  ON comment_replies (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_created
  ON direct_messages (conversation_key, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_dm_receiver_read
  ON direct_messages (receiver_id, is_read, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_sender_created
  ON direct_messages (sender_id, created_at DESC);
