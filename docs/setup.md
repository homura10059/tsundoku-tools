# セットアップガイド

## 前提条件

- Node.js 22 以上
- pnpm 9 以上
- Cloudflare アカウント (無料プランで可)
- Discord アプリケーション (OAuth 認証 + Webhook 通知用)

---

## ローカル開発環境の構築

### 1. リポジトリのクローン・依存関係のインストール

```bash
git clone https://github.com/homura10059/tsundoku-tools.git
cd tsundoku-tools
pnpm install
```

`pnpm install` 実行後に `simple-git-hooks` が自動的に pre-push hook を設定します。push 時に Biome チェックと型チェックが実行されます。

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して必要な値を設定
```

### 3. Wrangler ログイン

```bash
npx wrangler login
```

### 4. ローカル D1 のセットアップ

```bash
pnpm --filter @tsundoku-tools/db run db:migrate:local
```

### 5. 開発サーバーの起動

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

### 3. Discord アプリケーションの設定

[Discord Developer Portal](https://discord.com/developers/applications) で OAuth2 アプリケーションを作成し、以下を設定:

- **Redirects**: `https://<API_WORKER_URL>/auth/discord/callback`
- **Scopes**: `identify`

### 4. Secrets の設定

**apps/api**:
```bash
cd apps/api
npx wrangler secret put DISCORD_CLIENT_ID       # Discord OAuth アプリケーション ID
npx wrangler secret put DISCORD_CLIENT_SECRET   # Discord OAuth シークレット
npx wrangler secret put SESSION_SECRET          # セッション署名用のランダム文字列 (32文字以上推奨)
```

**apps/scraper-worker**:
```bash
cd apps/scraper-worker
npx wrangler secret put DISCORD_WEBHOOK_URL         # 価格変動通知用 Webhook
npx wrangler secret put DISCORD_ERROR_WEBHOOK_URL   # スクレイプエラー通知用 Webhook
```

### 5. API Worker のデプロイ

```bash
cd apps/api
pnpm deploy
# 出力された URL を控える (e.g., https://tsundoku-tools-api.xxxx.workers.dev)
```

`wrangler.toml` の `[vars]` に `API_URL` と `WEB_URL` を設定してください:

```toml
[vars]
API_URL = "https://tsundoku-tools-api.xxxx.workers.dev"
WEB_URL = "https://tsundoku-tools-web.pages.dev"
```

### 6. スクレイパー Worker のデプロイ

```bash
cd apps/scraper-worker
pnpm deploy
```

### 7. Web フロントエンドのデプロイ

```bash
cd apps/web
pnpm build
npx wrangler pages deploy dist \
  --project-name tsundoku-tools-web \
  --env PUBLIC_API_URL=https://tsundoku-tools-api.xxxx.workers.dev
```

---

## ウィッシュリストの登録

1. Web UI にアクセスして Discord でログイン
2. ウィッシュリスト管理画面で "+ 追加" をクリック
3. 名前と Amazon.co.jp ウィッシュリスト URL を入力
4. 次の Cron Trigger 実行 (最大 4 時間後) でスクレイプが開始されます

---

## トラブルシューティング

### スクレイプが失敗する

```bash
npx wrangler d1 execute tsundoku-tools --remote \
  --command "SELECT * FROM scrape_jobs WHERE status != 'success' ORDER BY started_at DESC LIMIT 10"
```

`errors` カラムに JSON 配列でエラー詳細が記録されています。

### Discord 通知が届かない

1. `DISCORD_WEBHOOK_URL` が正しく設定されているか確認 (`wrangler secret list`)
2. `notifications` テーブルに直近の記録があるか確認
3. クールダウン期間内 (`NOTIFY_COOLDOWN_HOURS`) の可能性を確認

### Amazon がブロックされる / スクレイプ結果が null ばかり

Amazon は定期的に DOM 構造を変更します。`packages/scraper/src/product.ts` と `packages/scraper/src/wishlist.ts` のセレクタを実際のページソースと比較して更新してください。

### ログイン (Discord OAuth) が失敗する

1. Discord Developer Portal の Redirect URI が正しいか確認
2. `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` が正しいか確認
3. `API_URL` が wrangler.toml に正しく設定されているか確認
