# CLAUDE.md

## このファイルのルール

- **全セッションで必要な情報のみ**をここに記載する
- 詳細情報は `docs/` 配下にファイルを作成し、必要に応じてリンクで参照する

## コマンド

```bash
pnpm install   # 依存インストール
pnpm test      # テスト実行（開発時はこまめに回す）
pnpm start     # src/main.ts を実行
pnpm build     # tsc でコンパイル（dist/）
pnpm lint      # Biome でチェック
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
  config.ts / types.ts / judge.ts / notify.ts / main.ts
fixtures/
  wishlist.json
```

→ 詳細: [docs/architecture.md](docs/architecture.md)

## 判定ロジック

割引率・ポイント還元率を**個別に**評価し、いずれかが 20% 以上なら通知対象（合算しない）。

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
