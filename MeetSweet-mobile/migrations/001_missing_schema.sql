-- Repairs confirmed missing by the live production schema probe.
-- The migration runner applies each statement only when its target is absent.

ALTER TABLE posts ADD COLUMN unlock_price INTEGER DEFAULT NULL;

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  push_notifications INTEGER NOT NULL DEFAULT 1,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  dark_mode INTEGER NOT NULL DEFAULT 1,
  data_saver INTEGER NOT NULL DEFAULT 0,
  autoplay_media INTEGER NOT NULL DEFAULT 1,
  biometric_login INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);