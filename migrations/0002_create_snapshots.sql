-- 巡回結果の観測ログ（増分8）。
--
-- 通知の判断には使わない（要件 2.4 のステートレス方針を維持）。価格推移の
-- 分析と、validate() が異常を検知したときの遡及調査のためだけに、毎回の
-- 巡回結果をフルスナップショットとして蓄積する。
--
-- 保持期間は180日。古い行の削除は src/repository/snapshots.ts の
-- pruneOldRuns() が実行の末尾で行う。ON DELETE CASCADE は宣言しているが、
-- D1（SQLite）側で外部キー制約が有効化されているか確証が持てないため、
-- 削除は CASCADE に頼らず item_snapshots → run_validation_errors → runs
-- の順に明示的に行う。

-- 1回の巡回（1リスト分）のメタ情報。
CREATE TABLE runs (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  wishlist_id            INTEGER NOT NULL REFERENCES wishlists(id),
  started_at             TEXT    NOT NULL, -- ISO8601（巡回開始時刻）
  finished_at            TEXT    NOT NULL, -- ISO8601（crawl/validate/judge完了時刻）
  item_count             INTEGER NOT NULL,
  kindle_price_found     INTEGER NOT NULL, -- P_kindle が取得できた件数
  base_price_found       INTEGER NOT NULL, -- P_base が取得できた件数
  paper_swatch_count     INTEGER NOT NULL, -- hasPaperSwatch = true の件数
  deal_count             INTEGER NOT NULL  -- judge() が返した件数。judge の結果自体（Deal型）は保存しない
);

-- pruneOldRuns() の started_at 検索と、item_key 経由の串刺し検索を支える。
CREATE INDEX idx_runs_wishlist_started ON runs (wishlist_id, started_at);

-- WishlistItem のフルスナップショット（毎回フル保存、変化がなくても全件）。
CREATE TABLE item_snapshots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  item_key         TEXT    NOT NULL, -- ASIN（10桁、大文字化）。抽出失敗時はクエリ文字列を落としたURL。
  title            TEXT    NOT NULL,
  url              TEXT    NOT NULL,
  format           TEXT    NOT NULL,
  base_price       INTEGER,           -- P_base（紙版なし/抽出失敗時は NULL）
  kindle_price     INTEGER,           -- P_kindle（抽出失敗時は NULL）
  points           INTEGER NOT NULL,  -- Pt
  has_paper_swatch INTEGER NOT NULL,  -- 0/1
  CHECK (has_paper_swatch IN (0, 1))
);

CREATE INDEX idx_item_snapshots_key ON item_snapshots (item_key);
CREATE INDEX idx_item_snapshots_run ON item_snapshots (run_id);

-- validate() が検知したエラー（judge() の結果は保存しない）。
CREATE TABLE run_validation_errors (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type    TEXT    NOT NULL, -- ValidationError["type"]
  detail  TEXT               -- foundCount/totalCount 等を JSON 文字列で。ALL_PRICES_MISSING は NULL。
);

CREATE INDEX idx_run_validation_errors_run ON run_validation_errors (run_id);
