-- 監視対象のウィッシュリスト。
-- 環境変数 WISHLIST_URL の代替であり、監視対象設定の唯一の情報源となる。
--
-- threshold: 判定閾値。NULL なら judge.ts の DEFAULT_THRESHOLD（0.2）を使う。
-- enabled:   0 にすると巡回対象から外れる。レコードは残るので後から戻せる。
--
-- Discord Webhook URL などのシークレットはここには置かない（D1 は平文で
-- 保持されるため）。引き続き環境変数から読む。

CREATE TABLE wishlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL UNIQUE,
  threshold  REAL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (threshold IS NULL OR (threshold > 0 AND threshold <= 1)),
  CHECK (enabled IN (0, 1))
);

CREATE INDEX idx_wishlists_enabled ON wishlists (enabled);
