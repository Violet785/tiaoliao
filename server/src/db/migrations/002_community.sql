-- 合并历史分店，保留配方、互动与旧链接的指向。
DROP INDEX uq_restaurant_identity;
CREATE TEMP TABLE brand_map AS
SELECT r.id, (SELECT s.id FROM restaurants s
  WHERE brand_key(s.name) = brand_key(r.name) AND s.status <> 'merged'
  ORDER BY (s.status = 'published') DESC, s.id LIMIT 1) AS target
FROM restaurants r WHERE r.status <> 'merged';
UPDATE recipes SET restaurant_id = (SELECT target FROM brand_map WHERE id = restaurant_id)
WHERE restaurant_id IN (SELECT id FROM brand_map);
UPDATE cook_logs SET restaurant_id = (SELECT target FROM brand_map WHERE id = restaurant_id)
WHERE restaurant_id IN (SELECT id FROM brand_map);
UPDATE restaurants SET status = 'merged', merged_into_id = (SELECT target FROM brand_map WHERE id = restaurants.id)
WHERE id IN (SELECT id FROM brand_map WHERE id <> target);
UPDATE restaurants SET name = brand_name(name), name_norm = brand_key(name);
CREATE UNIQUE INDEX uq_restaurant_brand ON restaurants(name_norm) WHERE status <> 'merged';
UPDATE restaurants SET
recipe_count = (SELECT COUNT(*) FROM recipes WHERE restaurant_id = restaurants.id AND status = 'published'),
cook_count = (SELECT COALESCE(SUM(cook_count), 0) FROM recipes WHERE restaurant_id = restaurants.id AND status = 'published');
DROP TABLE brand_map;

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('restaurant','recipe','feedback')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  client_token TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  published_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX uq_submission_retry ON submissions(user_id, client_token) WHERE client_token IS NOT NULL;
CREATE INDEX idx_submission_queue ON submissions(status, id DESC);
CREATE INDEX idx_submission_user ON submissions(user_id, id DESC);
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  mime TEXT NOT NULL,
  extension TEXT NOT NULL,
  access_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE recipe_images (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL REFERENCES uploads(id),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY(recipe_id, upload_id)
);
CREATE TABLE recipe_votes (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK(value IN (1,-1)),
  PRIMARY KEY(recipe_id, user_id)
);
