# 増分6: GitHub Actions による自動化

## 目的

ここまでで完成した CLI を、**定期実行（1日1回）**と**手動「今すぐ実行」**の両方で無人運用できるようにする。要件のアーキテクチャ分離（トリガー部と実行部の分離）を GitHub Actions で実現する。

## スコープ

### 含む
- `.github/workflows/monitor.yml`：
  - `schedule`（cron で1日1回）トリガー。
  - `workflow_dispatch`（GitHub 画面から手動「今すぐ実行」）トリガー。
  - `npm ci` + `npx playwright install --with-deps` でブラウザバイナリ込みのセットアップ。
  - Secrets（`WISHLIST_URL`, `DISCORD_WEBHOOK_URL`）を env として注入し、CLI を実行。
- README に Secrets 設定手順と手動実行手順を追記。

### 含まない
- アプリ本体のロジック変更（増分1〜5で確立済み）

## 実装内容

1. `.github/workflows/monitor.yml`：
   ```yaml
   on:
     schedule:
       - cron: "0 0 * * *"   # 1日1回（UTC。必要に応じ調整）
     workflow_dispatch: {}
   ```
   - `actions/setup-node`（npm キャッシュ）→ `npm ci` → `npx playwright install --with-deps` → `npm run start`。
   - `env:` に `WISHLIST_URL` / `DISCORD_WEBHOOK_URL` を `${{ secrets.* }}` から渡す。
2. トリガー部（ワークフローのスケジュール）と実行部（`npm run start` の中身）が分離していることを担保。
3. README に「Secrets 登録」「Actions 画面から Run workflow で即時実行」の手順を記載。

## 完了条件（DoD 対応）

- [ ] 定期実行（schedule）と、GitHub 画面からの手動実行（workflow_dispatch）の双方が成立する（**DoD 4.1 実行の分離**）。
- [ ] CI 環境で `npm ci` ＋ Playwright ブラウザインストールのみで過不足なくセットアップできる（**DoD 4.3 再現性**）。
- [ ] URL / Webhook が Secrets から注入され、リポジトリにハードコードされていない（**DoD 4.2**）。

## 検証方法

1. リポジトリの Settings → Secrets に `WISHLIST_URL` / `DISCORD_WEBHOOK_URL` を登録。
2. Actions 画面から `Run workflow`（workflow_dispatch）を実行し、Discord に通知が届くことを確認。
3. ワークフローログで `npm ci` と `playwright install` が成功し、`npm run start` が完走することを確認。
4. cron スケジュールが設定通りであることを確認（必要ならタイムゾーンを調整）。
