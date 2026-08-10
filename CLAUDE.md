# CLAUDE.md

## このファイルのルール

- **全セッションで必要な情報のみ**をここに記載する
- 詳細情報は `docs/` 配下にファイルを作成し、必要に応じてリンクで参照する

## コマンド

```bash
pnpm install          # 依存インストール
pnpm test             # テスト実行（開発時はこまめに回す）
pnpm start            # src/main.ts を実行
pnpm build            # tsc でコンパイル（dist/）
pnpm lint             # Biome でチェック
pnpm db:migrate       # D1 にマイグレーション適用（--remote）
pnpm db:migrate:local # ローカル D1 に適用（動作確認用）
```

## 環境変数

`.env.example` をコピーして `.env` を作成すること。

| 変数名 | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | D1:Edit 権限のみを持つ API トークン |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 データベース ID |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |
| `DISCORD_ERROR_WEBHOOK_URL` | エラー通知用 Discord Webhook URL |

**監視対象のウィッシュリスト URL は環境変数ではなく D1 の `wishlists` テーブルで管理する。**
シークレット（Webhook URL / API トークン）は D1 に置かない。

## ソース構成

```
src/
  config.ts / types.ts / judge.ts / diff.ts / notify.ts / main.ts
  d1/client.ts          Cloudflare D1 REST API クライアント
  repository/           D1 アクセス（wishlists / snapshots）
migrations/             D1 スキーマ（wrangler で適用）
fixtures/
  wishlist.json
```

→ 詳細: [docs/architecture.md](docs/architecture.md)

## 判定ロジック

割引率・ポイント還元率を**個別に**評価し、いずれかが閾値以上なら通知対象（合算しない）。
閾値は `wishlists.threshold` でリストごとに設定し、NULL なら既定値 20%。

判定を満たしたもののうち、**前回スナップショットから変化があったものだけを通知する**
（新規アイテム / 新規ヒット / 値下がり）。絶版の紙版がプレミア価格のまま毎日通知されるのを防ぐため。

→ 詳細: [docs/architecture.md](docs/architecture.md) / [要件定義](docs/requirement.md)

## 開発スタイル

**t-wada 推奨 TDD（Red → Green → Refactor）で進める。以後の全作業でも共通。**

- テストを先に書き、Red を確認してから最小限の実装で Green にする
- 1 ステップを細かく刻み、各 Green でコミット
- Refactor は Green を維持したまま行う

## 参照

- [アーキテクチャ詳細](docs/architecture.md)
- [要件定義](docs/requirement.md)
- [増分ロードマップ](issues/README.md)
