# 増分7: ウィッシュリスト設定の Cloudflare D1 移行

> **注記（増分9で方針転換）**: 本 issue の「通知挙動の変更（重複通知の抑制、
> 値下がり検知）は含まない／ステートレス方針は維持する」という判断は、
> [増分9](./09-notify-on-change.md) で覆っている。以下は増分7時点の記録として
> そのまま残す。

## 目的

監視対象のウィッシュリストを、環境変数の URL 1件から **Cloudflare D1 上のテーブル**へ移す。これにより「監視対象を増やす／一時的に止める／リストごとに判定の厳しさを変える」といった運用がコード変更・Secrets 変更なしで行えるようになる。

増分8（スナップショット保存）の土台にもなる。スナップショットは「どのリストの、いつの観測か」で引けなければ意味がないため、リストの実体を先に D1 へ置く。

## 前提となる設計判断

| 論点 | 採用 | 理由 |
| --- | --- | --- |
| D1 へのアクセス方法 | **REST API を Node から fetch で叩く** | 実行部は Playwright 必須のため GitHub Actions 上の Node で動き続ける。D1 のバインディングは Workers 専用なので使えない。wrangler CLI 経由だとアプリコードからの読み書きが CLI 呼び出しになり不格好 |
| マイグレーション管理 | **wrangler を devDependency** に追加し `migrations/` + `wrangler d1 migrations apply` | 適用済み管理が自動。実行時のアプリコードは REST API のままなので wrangler に依存しない |
| env との関係 | **D1 を唯一の情報源**にする（`WISHLIST_URL` は廃止） | 設定の在り処が2つあると「どちらが効いているか」が分からなくなる |
| 判定閾値 | **リスト単位（`threshold` 列、NULL なら既定 0.2）** | リストごとに厳しさを変えられる。既存の挙動は NULL で再現される |
| シークレット | Webhook URL は **env のまま** | D1 は平文で保持されるため、シークレットの置き場としては不適 |
| 複数リスト時の通知 | **リストごとに分けて送信** | どのリスト由来のヒットか分かる |

## スコープ

### 含む
- `wrangler` の devDependency 追加と `wrangler.toml`
- `migrations/0001_create_wishlists.sql`（`wishlists` テーブル）
- `src/d1/client.ts`：D1 REST API クライアント（`fetch` 注入可能）
- `src/repository/wishlists.ts`：有効なリストの取得と `threshold` の既定値解決
- `judge(items, threshold)` への閾値パラメータ追加（既定 `DEFAULT_THRESHOLD = 0.2`）
- `config.ts`：`WISHLIST_URL` を廃止し Cloudflare 系の env を追加
- `main.ts`：D1 から有効リストを取得し、**リストごと**にクロール→判定→通知
- `.env.example` / `CLAUDE.md` / `docs/` / `README.md` / `monitor.yml` の更新

### 含まない
- スクレイピング結果のスナップショット保存 → **増分8**
- 通知挙動の変更（重複通知の抑制、値下がり検知）。要件 §2.4 のステートレス方針は**維持する**
- Webhook URL の D1 移行（シークレットは env のまま）
- 抽出ロジック（`crawler.ts` / `extract`）の変更

## スキーマ

```sql
CREATE TABLE wishlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL UNIQUE,
  threshold  REAL,                                -- NULL なら既定値 0.2
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (threshold IS NULL OR (threshold > 0 AND threshold <= 1)),
  CHECK (enabled IN (0, 1))
);
```

`enabled = 0` のリストは巡回対象から外れる（レコードは残るので、後から戻せる）。

## 実装内容

1. **D1 クライアント**（TDD）
   `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query` に `{ sql, params }` を投げ、`result[0].results` を返す。`fetch` を引数で差し替えられるようにしてテストする。HTTP エラーおよび `success: false` は例外にする。
2. **wishlists リポジトリ**（TDD）
   `enabled = 1` の行を取得し、`threshold` が NULL の行に `DEFAULT_THRESHOLD` を埋めて返す。
3. **judge の閾値パラメータ化**（TDD）
   `judge(items, threshold = DEFAULT_THRESHOLD)`。既存テストは引数なしで通り続ける。
4. **config の移行**
   `WISHLIST_URL` を外し、`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_D1_DATABASE_ID` を必須にする。
5. **main のループ化**
   有効リストが0件なら異常として `exit 1`（設定漏れを黙って見逃さない）。各リストのバリデーションエラーは**そのリストをスキップして次へ進み**、最後にまとめて `exit 1` する（要件 4.2 のエラーハンドリング方針）。

## 完了条件（DoD 対応）

- [ ] `wishlists` に2件登録した状態で `pnpm start` を実行すると、両方のリストが巡回され、リストごとに Discord 通知が届く。
- [ ] `enabled = 0` にしたリストが巡回対象から外れる。
- [ ] `threshold` を 0.5 にしたリストで、割引率 20%〜50% の商品が通知されなくなる（**DoD 4.1 判定ロジックの正確性**）。
- [ ] `threshold` が NULL のリストは従来どおり 0.2 で判定される。
- [ ] Webhook URL / API トークンがコードにハードコードされず env から読まれている（**DoD 4.2 環境変数の秘匿**）。
- [ ] 1つのリストのバリデーションが落ちても他のリストの処理が継続する（**DoD 4.2 エラーハンドリング**）。
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` が通る（**DoD 4.3 型安全性**）。

## 検証方法

1. `pnpm exec wrangler d1 create tsundoku-tools` で DB を作成し、出力された `database_id` を `wrangler.toml` に記入。
2. `pnpm exec wrangler d1 migrations apply tsundoku-tools --remote` でスキーマを適用。
3. `pnpm exec wrangler d1 execute tsundoku-tools --remote --command "INSERT INTO wishlists (name, url) VALUES ('メイン', '<公開ウィッシュリストURL>')"` で1件投入。
4. `.env` に `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_D1_DATABASE_ID` を設定し `pnpm start`。従来と同じ通知が届くことを確認。
5. 2件目を投入し、リストごとに分かれて通知が届くことを確認。
6. GitHub Secrets に同じ3つを登録し、Actions の `Run workflow` から実行して通ることを確認。

## 運用上の注意

- API トークンは **D1:Edit 権限のみ**のカスタムトークンを発行する（アカウント全体の権限を持つトークンを使わない）。
- `database_id` はシークレットではないが、`wrangler.toml` に直書きするか Secrets 経由にするかはリポジトリの公開状況に応じて判断する。
