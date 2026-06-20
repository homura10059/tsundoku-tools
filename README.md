# tsundoku-tools

Amazon ウィッシュリストを監視し、割引率またはポイント還元率が 20% 以上の商品を Discord に通知するツール。

## セットアップ

### 1. 依存インストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各値を設定する。

```bash
cp .env.example .env
```

| 変数名 | 内容 |
|---|---|
| `WISHLIST_URL` | Amazon 公開ウィッシュリスト URL |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |

### 3. 実行

```bash
pnpm start
```

## GitHub Actions による自動実行

### Secrets の登録

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下の Secrets を登録する。

| Secret 名 | 内容 |
|---|---|
| `WISHLIST_URL` | Amazon 公開ウィッシュリスト URL |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL |

### 定期実行

毎日 UTC 00:00（JST 09:00）に自動実行される（`.github/workflows/monitor.yml` の `schedule` トリガー）。

### 手動実行

1. GitHub リポジトリの **Actions** タブを開く
2. 左メニューから **Monitor Wishlist** を選択
3. **Run workflow** ボタンをクリックして即時実行
