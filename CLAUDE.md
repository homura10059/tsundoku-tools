# CLAUDE.md

## プロジェクト概要

Amazon Kindle ウィッシュリストを監視し、実質20%以上お得な商品を Discord へ通知する TypeScript CLI ツール。

## コマンド

```bash
pnpm install      # 依存インストール
pnpm test         # Vitest でテスト実行（開発時はこまめに回す）
pnpm start        # src/main.ts を tsx で実行
pnpm build        # tsc でコンパイル（dist/）
pnpm lint         # Biome でチェック
```

## 環境変数

`.env.example` をコピーして `.env` を作成すること。

| 変数名 | 内容 |
|---|---|
| `WISHLIST_URL` | Amazon 公開ウィッシュリスト URL |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |

## ソース構成

```
src/
  config.ts     環境変数ロード・バリデーション
  types.ts      WishlistItem / Deal 型定義
  judge.ts      判定純粋関数（判定ロジックの中核）
  notify.ts     Discord Embed 通知送信
  main.ts       エントリーポイント（フィクスチャ→judge→notify）
fixtures/
  wishlist.json 静的サンプルデータ（スクレイピング実装前の代替）
```

## 判定ロジック

割引率とポイント還元率を**個別に**評価し、いずれかが 20% 以上なら通知対象。合算はしない。

```
discountRate = (P_base - P_kindle) / P_base >= 0.20
pointRate    = Pt / P_base                 >= 0.20
```

Kindle 以外の商品・価格欠損データは判定対象外として除外。

## 開発スタイル

**t-wada 推奨 TDD（Red → Green → Refactor）で進める。以後の全作業でも共通。**

- テストを先に書き、Red を確認してから最小限の実装で Green にする
- 1 ステップを細かく刻み、各 Green でコミット
- Refactor は Green を維持したまま行う

## 技術スタック

- TypeScript（target: ES2022, module: NodeNext）
- Vitest（テスト）
- Biome（linter / formatter）、インデント 2 スペース、ダブルクォート
- Playwright（増分3以降でスクレイピングに使用）
- tsx（TypeScript を直接実行）

## 増分ロードマップ

| 増分 | 内容 | 状態 |
|---|---|---|
| 01 | ウォーキングスケルトン（Discord 疎通確認） | 完了 |
| 02 | フィクスチャでの判定＋本物の通知内容 | 完了 |
| 03 | Playwright での Amazon ウィッシュリスト基本クローリング | 未着手 |
| 04 | 全件ロード・堅牢性 | 未着手 |
| 05 | Discord バッファリング（5件ごと分割送信） | 未着手 |
| 06 | GitHub Actions 自動化 | 未着手 |
