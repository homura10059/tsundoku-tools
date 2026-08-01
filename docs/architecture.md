# アーキテクチャ

## ソースファイル詳細

```
src/
  config.ts     環境変数ロード・バリデーション（dotenv）
  types.ts      WishlistItem / Deal 型定義
  judge.ts      判定純粋関数（判定ロジックの中核）
  notify.ts     Discord Embed 通知送信
  main.ts       エントリーポイント（フィクスチャ→judge→notify）
fixtures/
  wishlist.json 静的サンプルデータ（スクレイピング実装前の代替）
```

## 技術スタック

| 用途 | ツール |
|---|---|
| 言語 | TypeScript（target: ES2022, module: NodeNext） |
| テスト | Vitest |
| Linter / Formatter | Biome（インデント 2 スペース、ダブルクォート） |
| スクレイピング（増分3〜） | Playwright |
| TypeScript 直接実行 | tsx |

## 判定ロジック詳細

割引率とポイント還元率を**個別に**評価し、いずれかが 20% 以上なら通知対象。合算はしない。

```
discountRate = (P_base - P_kindle) / P_base >= 0.20
pointRate    = Pt / P_base                 >= 0.20
```

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
