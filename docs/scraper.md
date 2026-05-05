# スクレイパー設計

## 概要

`packages/scraper` は Amazon.co.jp のウィッシュリストページと商品ページを **Cloudflare Browser Rendering (`@cloudflare/puppeteer`)** でスクレイピングします。`BrowserSessionManager` が既存のブラウザセッションを再利用し、起動コストを抑えます。

---

## ファイル構成

```
packages/scraper/src/
├── session-manager.ts  # Cloudflare Browser Rendering セッション管理
├── rate-limiter.ts     # トークンバケット実装 (1 RPS)
├── wishlist.ts         # ウィッシュリストページ → ASIN[] の抽出
├── product.ts          # 商品ページ → ScrapeResult の抽出
└── index.ts            # パブリック API の re-export
```

---

## ブラウザセッション管理 (`session-manager.ts`)

`BrowserSessionManager` は Cloudflare Browser Rendering の既存セッションを優先して接続し、空きがなければ新規起動します。

```
acquire(binding):
  1. puppeteer.sessions() で未接続セッションを検索
  2. 見つかれば puppeteer.connect() で再利用
  3. なければ puppeteer.launch({ keep_alive: 600_000 }) で新規起動
```

`terminate()` でブラウザを閉じ、エラー時は `disconnect()` で安全に切断します。

---

## レートリミッター (`rate-limiter.ts`)

1 RPS (request per second) を保証するトークンバケット実装。

```
acquire():
  1. 前回リクエストからの経過時間を計算
  2. minIntervalMs (= 1000ms) 未満なら差分だけ待機
  3. lastRequestAt を更新して処理続行
```

Worker はリクエストごとにステートレスなため、レートリミッターのステートは **1 回の scheduled() 実行内でのみ有効**です。

---

## ウィッシュリストスクレイパー (`wishlist.ts`)

モバイル User-Agent で取得し、モバイル版レイアウトから ASIN を抽出します。

### 抽出対象 DOM 要素

| 情報 | セレクタ | 備考 |
|---|---|---|
| ASIN | `[data-reposition-action-params]` | JSON 内の `itemExternalId: "ASIN:XXXXXXXXXX"` |
| 商品名 | `span[id^='itemName_']` | テキスト内容 |
| サムネイル | `img[id^='itemImage_']` | `src` 属性 |
| 次ページ URL | `a[href*='_page=']` | ページネーション |

### ページネーション

1 ページ最大 ~50 件。`_page=2`, `_page=3` ... と続くページを再帰的に取得します。

---

## 商品スクレイパー (`product.ts`)

デスクトップ User-Agent で取得します。Amazon.co.jp の商品ページは頻繁に DOM 構造が変わるため、セレクタのメンテナンスが必要です。

### 抽出対象 DOM 要素

| 情報 | セレクタ | 備考 |
|---|---|---|
| 現在価格 | `.a-price-whole` | 整数部分。小数点以下は `.a-price-fraction` |
| 参考価格 | `.basisPrice .a-offscreen`, `#listPrice .a-offscreen` | `¥X,XXX` 形式 |
| ポイント | `#loyalty-points .a-color-base`, `#pointsValue` | `XXXpt` 形式 |
| 販売者 | `#merchant-info a`, `#sellerProfileTriggerId` | |
| 在庫切れ | `#outOfStock` | 要素存在で判定 |
| Prime | `#priceBadging_feature_div .a-badge-text` | "プライム" テキスト |

セレクタは `packages/scraper/src/product.ts` と `packages/scraper/src/wishlist.ts` に集約されています。DOM 変更時はここを更新してください。

---

## エラーハンドリング

- ページ取得失敗: `throw new Error(...)` → `scrape_jobs.errors` に記録
- セレクタが見つからない: `null` を返す (フィールドは nullable)
- 1 商品のエラーは他の商品の処理を妨げない (try/catch per ASIN)
- ジョブ全体の失敗: `DISCORD_ERROR_WEBHOOK_URL` にエラー通知を送信

`scrape_jobs.status` の値: `running` / `success` / `partial` / `failed`

---

## 開発時のテスト

```bash
cd apps/scraper-worker
pnpm dev

# ブラウザまたは curl でトリガー
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

ローカルでの Puppeteer 実行には `MYBROWSER` ブラウザバインディングが必要です。`wrangler.toml` の設定を確認してください。
