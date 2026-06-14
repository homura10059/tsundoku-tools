# 増分1: ウォーキングスケルトン（最薄の End-to-End）

## 目的

「データ取得 → 判定 → 通知」パイプラインの**骨格**を、最も薄い経路で End-to-End に通す。
具体的には、固定のダミーメッセージを Discord へ1件送信できる CLI を成立させ、プロジェクトの再現性・環境変数の秘匿・手動実行の仕組みを最初に確立する。

## スコープ

### 含む
- プロジェクト雛形の整備
  - `package.json`（npm。scripts: `build` / `start` / `test` / `lint`）
  - `tsconfig.json`
  - `biome.json`（Lint/Format）
  - `vitest.config.ts`
  - `.env.example`（`WISHLIST_URL`, `DISCORD_WEBHOOK_URL`）
  - `package-lock.json` をコミット（`npm ci` 用）
- `src/config.ts`：`.env` から環境変数を読み込み、未設定なら明示的にエラー終了する。
- `src/main.ts`：固定のダミーメッセージを Discord Webhook へ POST して終了する CLI エントリポイント。

### 含まない
- 判定ロジック（→ 増分2）
- 実データの取得・スクレイピング（→ 増分3）
- 分割送信・Embed 整形の作り込み（→ 増分2, 5）

## 実装内容

1. `package.json` を作成し、依存に `playwright`・`typescript`・`vitest`・`@biomejs/biome` 等を宣言（Playwright は後続増分で使用、ここで入れておくと再現性確認が一度で済む）。
2. `src/config.ts`：`process.env` から `WISHLIST_URL` / `DISCORD_WEBHOOK_URL` を読み取り、型付きの設定オブジェクトを返す。ハードコード禁止。
3. `src/main.ts`：`fetch` で Discord Webhook に `{ content: "..." }` を 1 件送信。成功/失敗をログ出力。
4. `npm run start` で `src/main.ts` を実行できるようにする（`tsx` などのランナー、または `build` → `node dist`）。

## 完了条件（DoD 対応）

- [ ] クリーンな環境で `npm ci` のみで依存が揃う（**DoD 4.3 再現性**）。
- [ ] `WISHLIST_URL` / `DISCORD_WEBHOOK_URL` がコードにハードコードされず、`.env` / 環境変数から読まれる（**DoD 4.2 環境変数の秘匿**）。
- [ ] ローカル CLI から `npm run start` を叩くと Discord にダミー通知が即時に届く（**DoD 4.1 実行の分離 / 手動実行**）。
- [ ] `npm run lint` が通る。

## 検証方法

1. `.env` に自分の Discord Webhook URL を設定。
2. `npm ci && npm run start` を実行。
3. Discord チャンネルにダミーメッセージが届くことを確認。
4. 別ディレクトリへ clone し直し、`npm ci` だけでビルド・起動できることを確認（再現性）。
