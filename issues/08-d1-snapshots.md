# 増分8: スクレイピング結果スナップショットの D1 保存

> **注記（増分9で方針転換）**: 本 issue の「通知挙動は変えない／重複通知の抑制・
> 値下がり検知は含まない」という判断は、[増分9](./09-notify-on-change.md) で
> 覆っている。ここに貯めたスナップショットは現在、差分通知の比較対象として
> 使われている。以下は増分8時点の記録としてそのまま残す。

## 目的

毎回の巡回結果を Cloudflare D1 に**観測ログとして**蓄積する。現状は実行のたびに結果が捨てられているため、

- 「この本、去年はいくらだったか」といった価格推移が分からない
- `validate()` が異常を検知しても、いつから劣化していたのかを後から追えない

という状態にある。スナップショットを残すことで、後から価格推移の分析や抽出ロジック劣化の遡及調査ができるようにする。

## 前提となる設計判断

| 論点 | 採用 | 理由 |
| --- | --- | --- |
| 保存粒度 | **毎回フル保存**（変化がなくても全件） | クエリが単純になる。100件/日でも年間3.6万行程度で D1 の無料枠に対して十分小さい |
| 保持期間 | **180日**（実行の末尾で古い行を DELETE） | 半年分の価格推移が残る。常時 1.8 万行程度に収まる |
| 通知挙動 | **変えない**（要件 §2.4 のステートレス方針を維持） | 保存はあくまで観測目的。重複通知の抑制や値下がり検知は別途判断する |
| 商品の同一性キー | **URL から抽出した ASIN**（抽出失敗時は正規化 URL） | run をまたいで価格履歴を紐づけるため。トラッキングパラメータや URL 形式の揺れに強い |
| 保存する内容 | `WishlistItem` の全フィールド + run 単位のメタ情報 + `validate()` のエラー内容 | judge の結果は保存しない（`P_base` / `P_kindle` / `Pt` があれば後から再計算できるため） |
| 書き込み失敗時 | **警告ログのみで通知は継続**（exit code は 0 のまま） | 保存は観測目的であり、失敗させて本来の通知を止める価値はない |

## スコープ

### 含む
- `migrations/0002_create_snapshots.sql`（`runs` / `item_snapshots` / `run_validation_errors`）
- `src/asin.ts`：Amazon の商品 URL から ASIN を抽出する純粋関数
- `src/repository/snapshots.ts`：run の記録、item スナップショットの一括 INSERT、保持期間超過分の削除
- `main.ts` への組み込み（保存失敗は握りつぶして警告ログのみ）
- `docs/` の更新（要件 §2.4 に「観測ログは保持するが通知判断には使わない」旨を明記）

### 含まない
- 蓄積したデータの可視化・分析 UI
- 重複通知の抑制、値下がり検知（通知挙動の変更）
- `judge()` の結果の保存（再計算可能なため）

## スキーマ（案）

```sql
CREATE TABLE runs (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  wishlist_id            INTEGER NOT NULL REFERENCES wishlists(id),
  started_at             TEXT    NOT NULL,
  finished_at            TEXT    NOT NULL,
  item_count             INTEGER NOT NULL,
  kindle_price_found     INTEGER NOT NULL,
  base_price_found       INTEGER NOT NULL,
  paper_swatch_count     INTEGER NOT NULL,
  deal_count             INTEGER NOT NULL
);

CREATE TABLE item_snapshots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  item_key         TEXT    NOT NULL,   -- ASIN、取れなければ正規化 URL
  title            TEXT    NOT NULL,
  url              TEXT    NOT NULL,
  format           TEXT    NOT NULL,
  base_price       INTEGER,            -- P_base
  kindle_price     INTEGER,            -- P_kindle
  points           INTEGER NOT NULL,   -- Pt
  has_paper_swatch INTEGER NOT NULL
);
CREATE INDEX idx_item_snapshots_key ON item_snapshots(item_key);
CREATE INDEX idx_item_snapshots_run ON item_snapshots(run_id);

CREATE TABLE run_validation_errors (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type    TEXT    NOT NULL,
  detail  TEXT                          -- foundCount/totalCount 等を JSON で
);
```

## 実装内容

1. **ASIN 抽出**（TDD）
   `/dp/XXXXXXXXXX` / `/gp/product/XXXXXXXXXX` 形式から10桁の ASIN を取る。取れない場合はクエリ文字列を落とした URL をキーとして返す。
2. **スナップショットリポジトリ**（TDD）
   - `runs` に1行 INSERT して `id` を得る。
   - `item_snapshots` を**バッチ INSERT**する。D1 の1クエリあたりのパラメータ上限に当たらないよう、適当な件数（例: 50件）ずつに分割する。
   - `validate()` のエラーを `run_validation_errors` に INSERT。
   - 180日より古い `runs` を削除（`item_snapshots` は `ON DELETE CASCADE`。D1 では `PRAGMA foreign_keys` の扱いに注意し、必要なら子テーブルも明示的に削除する）。
3. **main への組み込み**
   保存処理全体を try/catch で包み、失敗しても通知フローを止めない。

## 完了条件（DoD 対応）

- [ ] `pnpm start` を2回実行すると `runs` が2行、`item_snapshots` が「件数 × 2」行になる。
- [ ] 同じ商品のスナップショットが `item_key` で串刺しに引ける（`SELECT * FROM item_snapshots WHERE item_key = ? ORDER BY id`）。
- [ ] `validate()` がエラーを返した run で `run_validation_errors` に行が入る。
- [ ] D1 の認証情報を意図的に壊しても Discord 通知は届き、exit code が 0 のままである。
- [ ] 180日より古い `runs` とそれに紐づく `item_snapshots` が削除される。
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` が通る。

## 検証方法

1. `pnpm exec wrangler d1 migrations apply tsundoku-tools --remote` を適用。
2. `pnpm start` を2回実行し、`wrangler d1 execute ... --command "SELECT COUNT(*) FROM item_snapshots"` で行数が増えることを確認。
3. `CLOUDFLARE_API_TOKEN` にダミー値を入れて `pnpm start` し、警告ログが出つつ通知は届き `echo $?` が 0 であることを確認。
4. `runs.started_at` を手で181日前に書き換えて `pnpm start` し、その run と配下の `item_snapshots` が消えることを確認。
