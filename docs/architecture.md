# アーキテクチャ

## ソースファイル詳細

```
src/
  config.ts             環境変数ロード・バリデーション（dotenv）
  types.ts              Wishlist / WishlistItem / Deal 型定義
  judge.ts              判定純粋関数（判定ロジックの中核）
  diff.ts               前回スナップショットとの差分で通知対象を絞る純粋関数
  crawler.ts            Playwright によるクローリング
  validate.ts           抽出結果の健全性チェック
  notify.ts             Discord Embed 通知送信
  asin.ts               商品スナップショットのキー（ASIN）抽出
  main.ts               エントリーポイント（D1→crawl→validate→judge→差分抽出→スナップショット保存→notify）
  d1/client.ts          Cloudflare D1 REST API クライアント
  repository/
    wishlists.ts        巡回対象リストの取得
    snapshots.ts        巡回結果スナップショットの記録・読み出し・削除
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

### スナップショット（増分8〜）

毎回の巡回結果を `runs` / `item_snapshots` / `run_validation_errors`
（`migrations/0002_create_snapshots.sql`）にフル保存する。用途は3つ:
価格推移の分析、`validate()` が抽出率の劣化を検知したときの遡及調査、
そして**増分9で追加した差分通知の比較対象**（要件 2.4）。

増分8の時点では「観測目的のみ、通知の判断には使わない」という方針だったが、
増分9でこれを転換した。詳細は後述の「差分通知」を参照。

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
  `judge()` を呼ばないため `deal_count = 0`）。差分通知の導入後も
  `deal_count` の意味は変えない（`judge()` のヒット件数であって、実際に
  通知した件数ではない。通知件数はログにのみ出す）。

### 差分通知（増分9〜）

紙版が絶版になると参考価格（`P_base`）がマーケットプレイスのプレミア価格に
なり、価格が1円も動いていないのに `judge()` が毎日ヒットし続けて同じ商品が
通知され続ける。これを止めるため、`judge()` の結果をそのまま `notify()` に
渡さず、`selectChangedDeals()`（`src/diff.ts`）で前回の巡回から変化のあった
ものだけに絞る。

- **比較対象**: `fetchLatestRunItems()`（`src/repository/snapshots.ts`）が
  そのリストの**直前の run** の `item_snapshots` を `WishlistItem` に復元し、
  `item_key` をキーにした `Map` で返す。`snapshots.ts` に SELECT を置いた
  のはこれが初めて。
- **「前回の通知対象」の求め方**: 当時の判定結果は保存していないので、
  前回スナップショットに**現在の**閾値で `judge()` を再適用して求める。
  `judge()` と `extractItemKey()` をそのまま再利用しており、`diff.ts` は
  独自の判定ロジックを持たない。
- **通知する条件**: (1) 前回スナップショットに存在しない商品、(2) 前回は
  非対象で今回対象になった商品、(3) 前回も対象で `P_kindle` が下がった
  または `Pt` が増えた商品。絶版のプレミア価格は (3) に該当しないので沈黙する。
- **処理順序**: 前回スナップショットの取得は `saveRunSnapshot()` より**前**に
  行う。後に置くと今回の run が「直前の run」になり、自分自身と比較して
  常に0件になる。
- **読み取り失敗時の扱い**: `fetchLatestRunItems()` が失敗した場合は抑制せず
  全件通知し、警告ログのみ出して exit code は変えない。差分抑制は通知の質を
  上げる補助機能であり、通知漏れより重複通知の方が害が小さいため。D1 の
  読み取り失敗を致命的に扱う `fetchEnabledWishlists()` とは**扱いが違う**
  ので混同しないこと。
- **既知の制約**: `runs` に当時の閾値を保存していないため、
  `wishlists.threshold` を引き下げた瞬間に対象化した商品は、次に価格が
  動くまで通知されない。解消するには `runs.threshold` 列の追加
  （マイグレーション）が必要なので、必要になった時点で判断する。

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
