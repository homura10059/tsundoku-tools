# 増分9: スナップショット差分による通知抑制

## 目的

紙の本が絶版になると、商品詳細ページの紙版スロットに出る参考価格（`P_base`）が
マーケットプレイスのプレミア価格になる。その結果

```
discountRate = (P_base - P_kindle) / P_base
```

が恒常的に閾値を超え、**価格が1円も動いていないのに毎日同じ本が通知される**。

増分8で `item_snapshots` に毎回の巡回結果を貯めているので、これを比較対象に
使い、**前回の巡回から変化があった商品だけを通知する**ようにする。

## 前提となる設計判断

| 論点 | 採用 | 理由 |
| --- | --- | --- |
| 「変化」の定義 | **新規アイテム / 新規ヒット / 値下がり**（`P_kindle` の下落 or `Pt` の増加） | 絶版プレミア価格は日々わずかに変動しうる。「価格が1円でも変わったら通知」だと抑制しきれないケースがあるため、実際にお得になった方向の変化だけを拾う |
| 比較対象 | そのリストの**直前の run** の `item_snapshots` | 増分8で全件フル保存済み。`idx_runs_wishlist_started` と `idx_item_snapshots_run` がそのまま効く |
| 前回の通知対象の求め方 | 前回スナップショットに**現在の**閾値で `judge()` を再適用 | 判定結果（`Deal`）は保存していない（増分8の判断）。`judge()` は純粋関数なので再計算できる |
| マイグレーション | **不要** | `item_snapshots` に `WishlistItem` の全フィールドが揃っている |
| `runs.deal_count` の意味 | **変えない**（`judge()` のヒット件数のまま） | 観測ログとしての意味を保つ。実際に通知した件数はログに出す |
| 読み取り失敗時 | **抑制せず全件通知**（警告ログのみ、exit code は変えない） | 差分抑制は通知の質を上げる補助機能。通知漏れより重複通知の方が害が小さい |
| 絶版本そのものへの対処 | **やらない** | プレミア価格を `P_base` として使うこと自体の是非（異常値の除外など）は別途判断する |

## スコープ

### 含む
- `src/repository/snapshots.ts`：`fetchLatestRunItems()`（このファイル初の SELECT）
- `src/diff.ts`：`selectChangedDeals()`（純粋関数。`judge()` / `extractItemKey()` を再利用）
- `main.ts` への組み込み（取得は `saveRunSnapshot()` より前、失敗時は fail-open）
- `docs/requirement.md` §2.4 の改訂（ステートレス方針からの転換）と `docs/architecture.md` への追記

### 含まない
- マイグレーション（既存スキーマで足りる）
- 絶版・プレミア価格そのものの判定除外（`P_base` の異常値フィルタ）
- 通知履歴専用テーブルの新設（`item_snapshots` で足りる）
- `runs.deal_count` の意味変更、通知件数の永続化

## 通知条件

| 今回の判定 | 前回の状態 | 通知 |
| --- | --- | --- |
| ヒット | 前回スナップショットに存在しない（新規追加） | する |
| ヒット | 存在するが前回は非対象だった（新規ヒット） | する |
| ヒット | 前回も対象で、`P_kindle` が下落 or `Pt` が増加 | する |
| ヒット | 前回も対象で、値下がりもポイント増もない | **しない** ← 絶版プレミア価格はここで沈黙する |
| 非ヒット | — | しない（従来どおり） |

## 実装内容

1. **前回スナップショットの読み出し**（TDD）
   `runs` をサブクエリで直前1件（`ORDER BY started_at DESC, id DESC LIMIT 1`）に
   絞り、`item_snapshots` の行を `WishlistItem` へ復元して `item_key` をキーにした
   `Map` で返す。直前の run がなければ空の `Map`。
2. **差分抽出**（TDD）
   前回スナップショットを1件ずつ `judge()` にかけて `Map<item_key, Deal>` を作り、
   今回の `Deal[]` を「前回 `Deal` がない、または値下がりした」もので絞る。
3. **main への組み込み**
   `judge()` の直後・`saveRunSnapshot()` の前に差分抽出を挟む。順序を逆にすると
   今回の run が「直前の run」になり自分自身と比較してしまう。

## 既知の制約

`runs` に当時の閾値を保存していないため、前回スナップショットにも**現在の**閾値を
適用する。そのため `wishlists.threshold` を引き下げた瞬間に対象化した商品は、
次に価格が動くまで通知されない。解消には `runs.threshold` 列の追加（マイグレーション）
が必要なので、実際に困った時点で判断する。

## 完了条件（DoD 対応）

- [ ] `pnpm start` を2回連続で実行すると、2回目は「前回から変化のあった 0件」となり Discord に何も届かない。
- [ ] 直前 run の `kindle_price` を手で引き上げてから `pnpm start` すると、値下がり扱いで再通知される。
- [ ] `runs` / `item_snapshots` を空にしてから `pnpm start` すると、初回実行相当で全件通知される。
- [ ] 絶版本（`P_base` がプレミア価格で `P_kindle` が動かない）が毎日通知されなくなる。
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` が通る。

## 検証方法

マイグレーションの新規適用は不要（既存の `0002` で足りる）。

1. `pnpm start` を実行し、ヒットした商品が Discord に通知されることを確認。
2. 続けてもう一度 `pnpm start` を実行し、ログが
   `…N件が判定にヒット、うち前回から変化のあった 0件が通知対象です。` となり
   Discord に何も飛ばないことを確認する。
3. 値下がりを再現して再通知されることを確認:
   ```bash
   pnpm exec wrangler d1 execute tsundoku-tools --local --command \
     "UPDATE item_snapshots SET kindle_price = kindle_price + 500 \
      WHERE run_id = (SELECT MAX(id) FROM runs)"
   pnpm start
   ```
4. `DELETE FROM item_snapshots; DELETE FROM runs;` の後に `pnpm start` し、
   初回実行相当で全件通知されることを確認。
5. 本番は `monitor.yml`（毎日 0:00 UTC）のログで、`判定にヒット` の件数は出つつ
   `変化のあった 0件` の日が現れることを2〜3日確認する。
