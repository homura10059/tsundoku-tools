# セットアップガイド

## 前提条件

- Node.js 22 以上
- pnpm 9 以上
- Cloudflare アカウント (無料プランで可)
- Discord サーバーと Webhook URL

---

## ローカル開発環境の構築

### 1. リポジトリのクローン・依存関係のインストール

```bash
git clone https://github.com/homura10059/tsundoku-tools.git
cd tsundoku-tools
pnpm install
```

### 2. git hooks のセットアップ

`pnpm install` 実行後に `simple-git-hooks` が自動的に pre-push hook を設定します。
push 時に Biome チェックと型チェックが実行されます。

### 3. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して必要な値を設定
```

### 4. Wrangler ログイン

```bash
npx wrangler login
```

### 5. ローカル D1 のセットアップ

```bash
# ローカル D1 にマイグレーション適用
pnpm --filter @tsundoku-tools/db run db:migrate:local
```

### 6. 開発サーバーの起動

**API Worker** (別ターミナル):
```bash
cd apps/api
pnpm dev
# http://localhost:8787 で起動
```

**Web フロントエンド** (別ターミナル):
```bash
cd apps/web
pnpm dev
# http://localhost:4321 で起動
```

**スクレイパー Worker** (動作確認時):
```bash
cd apps/scraper-worker
pnpm dev
# Cron Trigger の手動実行:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

---

## Cloudflare へのデプロイ

### 1. D1 データベースの作成

```bash
npx wrangler d1 create tsundoku-tools
# 出力された database_id を控える
```

`apps/api/wrangler.toml` と `apps/scraper-worker/wrangler.toml` の `database_id` を更新してください。

### 2. D1 にマイグレーション適用

```bash
pnpm --filter @tsundoku-tools/db run db:migrate:remote
```

### 3. Secrets の設定

```bash
cd apps/scraper-worker
npx wrangler secret put DISCORD_WEBHOOK_URL
# プロンプトに Webhook URL を入力
```

### 4. API Worker のデプロイ

```bash
cd apps/api
pnpm deploy
# 出力された URL を控える (e.g., https://tsundoku-tools-api.xxxx.workers.dev)
```

### 5. スクレイパー Worker のデプロイ

```bash
cd apps/scraper-worker
pnpm deploy
```

### 6. Web フロントエンドのデプロイ

```bash
cd apps/web
pnpm build

# PUBLIC_API_URL に API Worker の URL を設定してデプロイ
npx wrangler pages deploy dist \
  --project-name tsundoku-tools-web \
  --env PUBLIC_API_URL=https://tsundoku-tools-api.xxxx.workers.dev
```

---

## ウィッシュリストの登録

1. Web UI (`https://your-pages-url.pages.dev/wishlists`) にアクセス
2. "+ 追加" ボタンをクリック
3. 名前と Amazon.co.jp ウィッシュリスト URL を入力して追加
4. 次の Cron Trigger 実行 (最大 4 時間後) でスクレイプが開始されます

---

## トラブルシューティング

### スクレイプが失敗する

```bash
# scrape_jobs テーブルのエラーを確認
npx wrangler d1 execute tsundoku-tools --remote \
  --command "SELECT * FROM scrape_jobs WHERE status != 'success' ORDER BY started_at DESC LIMIT 10"
```

### Discord 通知が届かない

1. `DISCORD_WEBHOOK_URL` が正しく設定されているか確認 (`wrangler secret list`)
2. `notifications` テーブルに直近の記録があるか確認
3. クールダウン期間内 (`NOTIFY_COOLDOWN_HOURS`) の可能性を確認

### Amazon がブロックされる

User-Agent や Accept-Language ヘッダーを更新してください (`packages/scraper/src/product.ts`)。
アクセス頻度が高すぎる場合は `SCRAPE_INTERVAL_MINUTES` を増やしてください。
