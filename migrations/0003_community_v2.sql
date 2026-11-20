-- Migration: 0003_community_v2.sql
-- Description: Community v2 schema (media assets, email OTP auth, reposts, admin & system settings)

CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data_base64 TEXT NOT NULL,
    filename TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_media (
    post_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, media_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_reposts (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_auth_emails (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_otp_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_reposts_post ON post_reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reposts_user ON post_reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_otp_email_created ON email_otp_codes(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);

INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
    ('site_name', 'Pulse 社区', '2026-01-01T00:00:00.000Z'),
    ('resend_from_email', 'onboarding@resend.dev', '2026-01-01T00:00:00.000Z'),
    ('otp_expiry_minutes', '10', '2026-01-01T00:00:00.000Z'),
    ('max_images_per_post', '4', '2026-01-01T00:00:00.000Z'),
    ('resend_api_key', '', '2026-01-01T00:00:00.000Z');
