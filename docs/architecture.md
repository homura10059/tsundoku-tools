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

→ 要件定義全文: [requirement.md](requirement.md)
