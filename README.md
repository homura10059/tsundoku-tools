# tsundoku-tools

Amazon ウィッシュリストを監視し、割引率またはポイント還元率が閾値（既定 20%）以上の商品を Discord に通知するツール。

監視対象のウィッシュリストは Cloudflare D1 の `wishlists` テーブルで管理する。複数リストを登録でき、リストごとに閾値を変えたり一時的に無効化したりできる。

## セットアップ

### 1. 依存インストール

```bash
pnpm install
```

### 2. Cloudflare D1 の準備

```bash
# データベースを作成し、出力された database_id を wrangler.toml に記入する
pnpm exec wrangler d1 create tsundoku-tools

# スキーマを適用する
pnpm db:migrate
```

API トークンは **D1:Edit 権限のみ**のカスタムトークンを発行すること（アカウント全体の権限を持つトークンは使わない）。

### 3. 監視対象リストの登録

```bash
pnpm exec wrangler d1 execute tsundoku-tools --remote --command \
  "INSERT INTO wishlists (name, url) VALUES ('メイン', '<公開ウィッシュリストURL>')"
```

| 列 | 内容 |
|---|---|
| `name` | リストの表示名（Discord 通知の見出しに使われる） |
| `url` | Amazon 公開ウィッシュリスト URL |
| `threshold` | 判定閾値。省略（NULL）で既定の 0.2 |
| `enabled` | `0` にすると巡回対象から外れる |

閾値を変える・一時的に止める例：

```sql
UPDATE wishlists SET threshold = 0.4 WHERE name = 'メイン';
UPDATE wishlists SET enabled = 0 WHERE name = 'メイン';
```

### 4. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各値を設定する。

```bash
cp .env.example .env
```

| 変数名 | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | D1:Edit 権限のみを持つ API トークン |
| `CLOUDFLARE_D1_DATABASE_ID` | `wrangler d1 create` が出力した ID |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |
| `DISCORD_ERROR_WEBHOOK_URL` | エラー通知用 Discord Webhook URL |

### 5. 実行

```bash
pnpm start
```

## GitHub Actions による自動実行

### Secrets の登録

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下の Secrets を登録する。

| Secret 名 | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | D1:Edit 権限のみを持つ API トークン |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 データベース ID |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |
| `DISCORD_ERROR_WEBHOOK_URL` | エラー通知用 Discord Webhook URL |

### 定期実行

毎日 UTC 00:00（JST 09:00）に自動実行される（`.github/workflows/monitor.yml` の `schedule` トリガー）。

### 手動実行

1. GitHub リポジトリの **Actions** タブを開く
2. 左メニューから **Monitor Wishlist** を選択
3. **Run workflow** ボタンをクリックして即時実行
