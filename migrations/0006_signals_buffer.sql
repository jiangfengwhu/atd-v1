-- Production feedback & runtime error buffer for zero-loss dual-path sync with AutoDev Studio
CREATE TABLE IF NOT EXISTS autodev_feedback_queue (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feature',
  page_route TEXT NOT NULL DEFAULT '/',
  user_hash TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autodev_feedback_synced_created
  ON autodev_feedback_queue (synced, created_at);

CREATE INDEX IF NOT EXISTS idx_autodev_feedback_user_created
  ON autodev_feedback_queue (user_hash, created_at);

CREATE TABLE IF NOT EXISTS autodev_error_queue (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'frontend',
  error_name TEXT NOT NULL DEFAULT 'Error',
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '/',
  http_status INTEGER,
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  environment TEXT NOT NULL DEFAULT 'production',
  user_hash TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autodev_error_synced_created
  ON autodev_error_queue (synced, created_at);

CREATE INDEX IF NOT EXISTS idx_autodev_error_user_created
  ON autodev_error_queue (user_hash, created_at);
