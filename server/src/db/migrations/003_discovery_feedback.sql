-- 参考配方与用户投稿分开标识，避免把未试配内容显示为真实体验。
ALTER TABLE recipes ADD COLUMN content_type TEXT NOT NULL DEFAULT 'community' CHECK(content_type IN ('community','reference'));
ALTER TABLE recipes ADD COLUMN content_source TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN cover_illustration TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN reference_key TEXT;
CREATE UNIQUE INDEX uq_recipe_reference ON recipes(reference_key) WHERE reference_key IS NOT NULL;
ALTER TABLE ratings ADD COLUMN feedback_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN resubmitted_from INTEGER REFERENCES submissions(id);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_notification_user ON notifications(user_id, id DESC);
