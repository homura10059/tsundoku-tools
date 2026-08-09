# アーキテクチャ

## ソースファイル詳細

```
src/
  config.ts             環境変数ロード・バリデーション（dotenv）
  types.ts              Wishlist / WishlistItem / Deal 型定義
  judge.ts              判定純粋関数（判定ロジックの中核）
  crawler.ts            Playwright によるクローリング
  validate.ts           抽出結果の健全性チェック
  notify.ts             Discord Embed 通知送信
  asin.ts               商品スナップショットのキー（ASIN）抽出
  main.ts               エントリーポイント（D1→crawl→validate→judge→notify→スナップショット保存）
  d1/client.ts          Cloudflare D1 REST API クライアント
  repository/
    wishlists.ts        巡回対象リストの取得
    snapshots.ts        巡回結果スナップショットの記録・削除
migrations/              D1 スキーマ（wrangler で適用）
  0001_create_wishlists.sql       wishlists テーブル
  0002_create_snapshots.sql       runs / item_snapshots / run_validation_errors テーブル
fixtures/
  wishlist.json         静的サンプルデータ（スクレイピング実装前の代替）
```

## 技術スタック

| 用途 | ツール |
|---|---|
| 言語 | TypeScript（target: ES2022, module: NodeNext） |
| テスト | Vitest |
| Linter / Formatter | Biome（インデント 2 スペース、ダブルクォート） |
| スクレイピング（増分3〜） | Playwright |
| 永続化（増分7〜） | Cloudflare D1 |
| D1 スキーマ管理 | wrangler（devDependency） |
| TypeScript 直接実行 | tsx |

## 永続化（Cloudflare D1）

### なぜ REST API 経由なのか

D1 のバインディング（`env.DB`）は Cloudflare Workers からしか使えない。一方、
本ツールの実行部は Playwright を必要とするため GitHub Actions 上の Node で
動き続ける必要がある。そのため `src/d1/client.ts` で HTTP の query
エンドポイント（`/accounts/{id}/d1/database/{id}/query`）を直接叩いている。

wrangler は devDependency として入れているが、用途は `migrations/` の適用
だけで、実行時のアプリコードは wrangler に依存しない。

### wishlists テーブル

監視対象の唯一の情報源。環境変数 `WISHLIST_URL` は増分7で廃止した
（設定の在り処が2つあると、どちらが効いているか分からなくなるため）。

| 列 | 内容 |
|---|---|
| `name` | リストの表示名。Discord 通知の見出しに使う |
| `url` | 公開ウィッシュリスト URL（UNIQUE） |
| `threshold` | 判定閾値。NULL なら `DEFAULT_THRESHOLD`（0.2） |
| `enabled` | 0 にすると巡回対象から外れる（レコードは残る） |

シークレット（Discord Webhook URL / Cloudflare API トークン）は D1 に置かない。
D1 は平文で保持されるため、引き続き環境変数から読む。

### 複数リストの扱い

`main.ts` は有効なリストを順に巡回し、**リストごとに**判定と通知を行う。
1つのリストがバリデーションに失敗しても他のリストの処理は継続し、
終了コードにだけ反映する（要件 4.2 のエラーハンドリング方針）。

### スナップショット（観測ログ、増分8〜）

毎回の巡回結果を `runs` / `item_snapshots` / `run_validation_errors`
（`migrations/0002_create_snapshots.sql`）にフル保存する。**通知の判断には
使わない**（要件 2.4 のステートレス方針を維持）。目的は価格推移の分析と、
`validate()` が抽出率の劣化を検知したときの遡及調査の2つに限る。

- **保存粒度・保持期間**: 毎回全件フル保存。180日を超えた `runs` とその
  配下は、実行の末尾で `pruneOldRuns()`（`src/repository/snapshots.ts`）が
  削除する。スキーマ上は `ON DELETE CASCADE` を宣言しているが、D1 で
  外部キー制約が有効化されているか確証が持てないため、CASCADE には頼らず
  `item_snapshots` → `run_validation_errors` → `runs` の順に明示的に
  DELETE する。
- **商品キー（`item_key`）**: `src/asin.ts` の `extractItemKey()` が
  URL から ASIN（10桁、大文字化）を抽出する。抽出できない場合はクエリ
  文字列を落とした URL をキーにする。run をまたいで同じ商品を串刺しに
  引けるようにするため。
- **`run.id` の取得方法**: `D1Client.query` は `meta.last_row_id` を
  返さず、かつ別クエリで `last_insert_rowid()` を発行してもコネクション
  状態に依存し信頼できないため、`INSERT ... RETURNING id` で同一クエリの
  レスポンスから id を得ている。ローカル D1 に加え、本番リモート D1
  （`monitor.yml` run #61, 2026-08-09）でも動作を確認済み。
- **バッチ INSERT のサイズ**: `item_snapshots` は9列あり、Cloudflare の
  1クエリあたりのバウンドパラメータ上限を開発時点では実測できなかった
  （`developers.cloudflare.com` がこの開発環境のネットワークポリシーで
  ブロックされていたため）。決め打ちを避け、9列 × 10行 = 90パラメータ
  という安全側の値（`ITEM_SNAPSHOT_BATCH_SIZE`）を採用した。本番リモート
  D1（`monitor.yml` run #61, 2026-08-09）で38件・24件のリストに対して
  バッチINSERTが実際に成功することを確認済み。
- **書き込み失敗時の扱い**: `saveRunSnapshot()` / `pruneOldRuns()` の失敗は
  `main.ts` 側で try/catch し、警告ログのみで通知フロー（`notify`/
  `notifyError`）と終了コードには影響させない。D1 の**読み取り**失敗
  （`fetchEnabledWishlists`）は設定漏れ・接続不能を示すため、従来通り
  致命的エラーとして扱う（この違いを混同しないこと）。
- **judge の結果は保存しない**: `item_snapshots` には `P_base` /
  `P_kindle` / `Pt` を保存し、`discountRate` 等の判定結果（`Deal` 型）は
  保存しない。後から `judge()` で再計算できるため。ただし `runs.deal_count`
  はヒット件数の集計値としてのみ保存する（バリデーション失敗時は
  `judge()` を呼ばないため `deal_count = 0`）。

## 判定ロジック詳細

割引率とポイント還元率を**個別に**評価し、いずれかが閾値以上なら通知対象。合算はしない。

```
discountRate = (P_base - P_kindle) / P_base >= threshold
pointRate    = Pt / P_base                 >= threshold
```

`threshold` は `wishlists.threshold`（NULL なら 0.2）。同じ閾値を `notify.ts`
にも渡している。embed に「割引率」「ポイント還元率」のどちらを表示するかの
選別に使うためで、渡さないと判定結果と表示がずれる。

- `P_base`：単行本（紙）の定価または参考価格
- `P_kindle`：現在の Kindle 販売価格
- `Pt`：商品ページに明示されているポイント（期間限定含む）

Kindle 以外の商品・価格欠損データ（`null`）は判定対象外として除外。

## クローリング詳細（P_base の取得方針）

`P_base`（参考価格）は**商品詳細ページを巡回して取得する**。一覧ページ
（ウィッシュリスト画面）に取り消し線付き参考価格が出るケースは実データ上
確認できなかった（`.a-text-strike` のヒット数が常に0件）ため、一覧ページ
だけに頼ると `judge()` が実データに対して恒久的に0件を返してしまう。

- 一覧ページからは Kindle 判定と `P_kindle`（現在価格）・`Pt`（ポイント）
  のみを取得する。
- Kindle と判定された各アイテムについて、商品詳細ページの `#tmmSwatches`
  フォーマットスイッチャーから Kindle 以外のスロット（`[id^="tmm-grid-swatch-"]`
  のうち `tmm-grid-swatch-KINDLE` でないもの）を探し、その `.slot-price`
  内の価格を `P_base` として取得する。紙版が存在しない商品では取得できず
  `P_base: null` のまま（判定対象外）となるが、これは仕様通りの挙動。
- 「紙版が存在しない（正常）」と「紙版スロットはあるのに価格抽出に失敗した
  （異常）」を区別するため、`WishlistItem.hasPaperSwatch` に詳細ページで
  非 Kindle スロットが見つかったかどうかを保持する。`validate()` は
  `hasPaperSwatch: true` の item だけを母数にして `P_base` の取得率を見る
  ことで、紙版なし商品を誤検知せずに抽出ロジックの劣化を検知する
  （`REFERENCE_PRICE_EXTRACTION_DEGRADED`）。
- 詳細ページへの遷移は Kindle アイテム数だけ発生するため、**一覧ページのみ
  の場合より実行時間が数分単位で増加する**（既存の `jitter()` を各遷移間
  に挟むため、件数 × 1〜3秒程度）。

→ 要件定義全文: [requirement.md](requirement.md)
