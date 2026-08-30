CREATE TABLE IF NOT EXISTS ai_provider_keys (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
