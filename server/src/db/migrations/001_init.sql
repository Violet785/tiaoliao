-- ═══════════════════════════════════════════════════════════════
--  001_init —— 建表
--
--  约定：
--  · 时间一律 strftime('%Y-%m-%dT%H:%M:%SZ','now') —— UTC，带 T 和 Z。
--    绝不用 datetime('now','localtime')，它产出 'YYYY-MM-DD HH:MM:SS'，
--    该格式在 iOS Safari / 微信内置浏览器里 new Date() 会得到 Invalid Date。
--  · 布尔一律 INTEGER 0/1（node:sqlite 绑定 true 会直接抛错，统一用数字）。
--  · 枚举用 CHECK 约束而非外键表，够用且查询简单。
-- ═══════════════════════════════════════════════════════════════


-- ─────────────── 用户与会话 ───────────────

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,                 -- 登录名
  password_hash TEXT NOT NULL,                        -- scrypt: salt:hash
  nickname      TEXT NOT NULL DEFAULT '吃货',
  avatar_url    TEXT,
  wx_openid     TEXT UNIQUE,                          -- 预留微信一键登录，现在为 NULL
  role          TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user','moderator','admin')),
  status        TEXT NOT NULL DEFAULT 'normal'
                CHECK (status IN ('normal','muted','banned')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 不透明 token 而非 JWT：可随时撤销（登出 / 封禁），role 改动即时生效
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,                        -- 32 字节 hex
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL DEFAULT 'h5'
             CHECK (platform IN ('h5','mp-weixin','app')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);


-- ─────────────── 餐馆（用户自建） ───────────────

CREATE TABLE IF NOT EXISTS restaurants (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,                       -- 原始名，展示用
  name_norm      TEXT NOT NULL,                       -- NFKC+去空白+去标点+小写，用于搜索与去重
  city           TEXT NOT NULL DEFAULT '',
  city_norm      TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  address_norm   TEXT NOT NULL DEFAULT '',
  landmark       TEXT NOT NULL DEFAULT '',            -- 商场/楼层，用于同名店区分
  category       TEXT NOT NULL DEFAULT '自助餐',
  note           TEXT NOT NULL DEFAULT '',
  recipe_count   INTEGER NOT NULL DEFAULT 0,
  cook_count     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','hidden','merged')),
  merged_into_id INTEGER REFERENCES restaurants(id),
  client_token   TEXT,                                -- 客户端 UUID，防弱网重试重复建店
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 去重第一层：同城 + 同名 + 同址只能有一条（已合并的除外）。
-- 部分唯一索引，node:sqlite 实测支持。
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_identity
  ON restaurants(city_norm, name_norm, address_norm) WHERE status <> 'merged';

-- 去重第三层：同一 clientToken 只建一次（幂等）
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_client_token
  ON restaurants(client_token) WHERE client_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rest_name ON restaurants(name_norm);
CREATE INDEX IF NOT EXISTS idx_rest_city ON restaurants(city_norm, recipe_count DESC, id DESC);


-- ─────────────── 调料主数据（平台维护，非 UGC） ───────────────
--
-- id 用稳定语义字符串而非自增：seed 可幂等重跑、配方引用永不错位、日志可读。

CREATE TABLE IF NOT EXISTS condiments (
  id             TEXT PRIMARY KEY,                    -- 'oil_sesame'
  name           TEXT NOT NULL UNIQUE,                -- '香油（芝麻油）'
  short_name     TEXT NOT NULL DEFAULT '',            -- '香油' —— 照着配大字用
  category       TEXT NOT NULL
                 CHECK (category IN ('oil','paste','sauce','aroma','powder','crunch','extra')),
  stage_order    INTEGER NOT NULL DEFAULT 0,          -- 「幕」序号，决定照着配的步骤顺序
  sort_order     INTEGER NOT NULL DEFAULT 0,          -- 同幕内默认顺序（模拟调料台摆位）
  glyph          TEXT NOT NULL DEFAULT '',            -- 单汉字视觉锚点：香/麻/蒜/醋
  color          TEXT NOT NULL DEFAULT '#8A8A8A',     -- 类目色
  default_amount INTEGER NOT NULL DEFAULT 3 CHECK (default_amount BETWEEN 0 AND 5),
  unit_hint      TEXT NOT NULL DEFAULT '勺',          -- 勺/块/瓣/滴/片 —— 物理锚点由它 + 用量档位组合而成
  flavor_tags    TEXT NOT NULL DEFAULT '[]',          -- JSON: ["辣","香"]
  spicy_weight   INTEGER NOT NULL DEFAULT 0 CHECK (spicy_weight BETWEEN 0 AND 5),
  salty_weight   INTEGER NOT NULL DEFAULT 0 CHECK (salty_weight BETWEEN 0 AND 5),
  rich_weight    INTEGER NOT NULL DEFAULT 0 CHECK (rich_weight BETWEEN 0 AND 5),
  caution        TEXT NOT NULL DEFAULT '',            -- '放多了会发苦'
  is_allergen    INTEGER NOT NULL DEFAULT 0 CHECK (is_allergen IN (0,1)),
  status         TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','pending','hidden')),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_condiment_cat ON condiments(category, sort_order);


-- ─────────────── 配方 ───────────────

CREATE TABLE IF NOT EXISTS recipes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id  INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  serving_note   TEXT NOT NULL DEFAULT '',            -- '一小碗，够蘸 10 串'
  item_count     INTEGER NOT NULL DEFAULT 0,
  total_amount   INTEGER NOT NULL DEFAULT 0,          -- Σ amount_level，映射清淡/适中/重口
  heat_score     INTEGER NOT NULL DEFAULT 0,          -- 0-100，口味画像
  salt_score     INTEGER NOT NULL DEFAULT 0,
  rich_score     INTEGER NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  rating_sum     INTEGER NOT NULL DEFAULT 0,
  rating_avg     REAL    NOT NULL DEFAULT 0,          -- 冗余，排序用
  favorite_count INTEGER NOT NULL DEFAULT 0,
  cook_count     INTEGER NOT NULL DEFAULT 0,          -- ★ 照着配完成次数，最强排序信号
  hot_score      REAL    NOT NULL DEFAULT 0,          -- 由 services/recipeStats.js 重算
  status         TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','pending','rejected','deleted')),
  client_token   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_recipe_rest ON recipes(restaurant_id, status, hot_score DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_user ON recipes(user_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_hot  ON recipes(status, hot_score DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_client_token
  ON recipes(client_token) WHERE client_token IS NOT NULL;

-- 配方明细。amount_level 给机器（排序/聚合），amount_label 给人（写入时固化，
-- 这样以后改文案映射表，历史配方显示不会漂移）。
CREATE TABLE IF NOT EXISTS recipe_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id    INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  condiment_id TEXT    NOT NULL REFERENCES condiments(id),
  condiment_name TEXT  NOT NULL,                      -- 冗余快照
  amount_level INTEGER NOT NULL CHECK (amount_level BETWEEN 0 AND 5),
  amount_label TEXT    NOT NULL,
  amount_note  TEXT    NOT NULL DEFAULT '',
  -- 照着配的步骤序号，由服务端按「幕」排序后固化。
  -- 「不放」(level=0) 的项为 NULL：它们不进步骤序列，只在开场/收尾作为警示显示。
  -- SQLite 的唯一索引把多个 NULL 视为互不相同，所以多行 NULL 不会冲突。
  step_index   INTEGER,
  stage_order  INTEGER NOT NULL DEFAULT 0,
  stage_name   TEXT    NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_condiment ON recipe_items(recipe_id, condiment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_step      ON recipe_items(recipe_id, step_index);
CREATE INDEX IF NOT EXISTS        idx_item_recipe   ON recipe_items(recipe_id, step_index);
CREATE INDEX IF NOT EXISTS        idx_item_cond     ON recipe_items(condiment_id);


-- ─────────────── 标签（口味 / 食材 / 场景 三个命名空间） ───────────────

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,                        -- 'taste_mala' / 'food_lamb'
  kind       TEXT NOT NULL CHECK (kind IN ('taste','food','scene')),
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'published'
             CHECK (status IN ('published','hidden'))
);
CREATE INDEX IF NOT EXISTS idx_tags_kind ON tags(kind, sort_order);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    TEXT    NOT NULL REFERENCES tags(id),
  PRIMARY KEY (recipe_id, tag_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag_id, recipe_id);


-- ─────────────── 评分（一人一配方一条，可编辑） ───────────────

CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  content    TEXT NOT NULL DEFAULT '',
  taste_ok   INTEGER CHECK (taste_ok IN (0,1)),       -- 复刻后是否合口味（可选，闭环验证）
  status     TEXT NOT NULL DEFAULT 'published'
             CHECK (status IN ('published','pending','rejected','deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_user_recipe ON ratings(recipe_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rating_recipe ON ratings(recipe_id, status, id DESC);


-- ─────────────── 收藏 ───────────────

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, recipe_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_fav_recipe ON favorites(recipe_id);


-- ─────────────── 「照着配」行为日志 ───────────────
--
-- 这张表是产品数据资产的核心：skipped/substituted 记录了「这家店实际有什么料」，
-- 积累起来就能回答「每家店调料台不一样」这个原始命题。

CREATE TABLE IF NOT EXISTS cook_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL,
  finished      INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0,1)),
  step_reached  INTEGER NOT NULL DEFAULT 0,
  skipped       TEXT NOT NULL DEFAULT '[]',           -- JSON: ["paste_jiucaihua"]
  substituted   TEXT NOT NULL DEFAULT '[]',           -- JSON: [{"from":"oil_sesame","to":"oil_peanut"}]
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cooklog_recipe ON cook_logs(recipe_id, finished);
CREATE INDEX IF NOT EXISTS idx_cooklog_user   ON cook_logs(user_id, id DESC);
