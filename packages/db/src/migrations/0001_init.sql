CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY,
  amazon_list_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  scrape_interval_minutes INTEGER NOT NULL DEFAULT 360,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  asin TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wishlist_products (
  id TEXT PRIMARY KEY,
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  asin TEXT NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  removed_at TEXT,
  UNIQUE(wishlist_id, asin)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  scraped_at TEXT NOT NULL,
  price_jpy INTEGER,
  list_price_jpy INTEGER,
  discount_rate_pct REAL,
  points INTEGER,
  point_rate_pct REAL,
  is_prime INTEGER NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1,
  seller TEXT,
  coupon_pct REAL,
  coupon_jpy INTEGER
);

CREATE INDEX IF NOT EXISTS idx_snapshots_asin_scraped_at
  ON price_snapshots(asin, scraped_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  old_value REAL,
  new_value REAL,
  change_pct REAL,
  sent_at TEXT NOT NULL,
  discord_message_id TEXT
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id TEXT PRIMARY KEY,
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  products_scraped INTEGER NOT NULL DEFAULT 0,
  errors TEXT
);
