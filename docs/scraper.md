# スクレイパー設計

## 概要

`packages/scraper` は Amazon.co.jp のウィッシュリストページと商品ページを fetch + HTMLRewriter でスクレイピングします。Cloudflare Workers の V8 ランタイム上で動作するため、Node.js 専用 API (Playwright, Puppeteer, cheerio 等) は使用しません。

---

## ファイル構成

```
packages/scraper/src/
├── rate-limiter.ts   # トークンバケット実装
├── wishlist.ts       # ウィッシュリストページ → ASIN[] の抽出
├── product.ts        # 商品ページ → ScrapeResult の抽出
└── index.ts          # パブリック API の re-export
```

---

## レートリミッター (`rate-limiter.ts`)

1 RPS (request per second) を保証するトークンバケット実装。

```
容量: 1 トークン
補充レート: 1 トークン / 秒

acquire():
  1. 前回リクエストからの経過時間を計算
  2. minIntervalMs (= 1000ms) 未満なら差分だけ待機
  3. lastRequestAt を更新して処理続行
```

Worker はリクエストごとにステートレスなため、レートリミッターのステートは **1 回の scheduled() 実行内でのみ有効**です。複数 Worker インスタンスが同時に起動した場合は合計 RPS が増える可能性がありますが、Cron Trigger は同時実行が 1 インスタンスに制限されるため問題ありません。

---

## ウィッシュリストスクレイパー (`wishlist.ts`)

### Amazon ウィッシュリスト URL パターン

```
https://www.amazon.co.jp/wishlist/ls/{LIST_ID}
https://www.amazon.co.jp/hz/wishlist/ls/{LIST_ID}
```

### 抽出対象 DOM 要素

| 情報 | セレクタ | 備考 |
|---|---|---|
| ASIN | `[data-reposition-action-params]` | JSON 内の `itemExternalId: "ASIN:XXXXXXXXXX"` |
| 商品名 | `span[id^='itemName_']` | テキスト内容 |
| サムネイル | `img[id^='itemImage_']` | `src` 属性 |
| 次ページ URL | `a[href*='_page=']` | ページネーション |

### ページネーション

ウィッシュリストは 1 ページ最大 ~50 件。`_page=2`, `_page=3` ... と続くページを再帰的に取得します。各ページ取得にもレートリミッターを適用します。

---

## 商品スクレイパー (`product.ts`)

### 抽出対象 DOM 要素

Amazon.co.jp の商品ページは頻繁に DOM 構造が変わります。以下は 2024 年時点の主要セレクタです。

| 情報 | セレクタ | 備考 |
|---|---|---|
| 現在価格 | `.a-price-whole` | 整数部分。小数点以下は `.a-price-fraction` |
| 参考価格 | `.basisPrice .a-offscreen`, `#listPrice .a-offscreen` | `¥X,XXX` 形式 |
| ポイント | `#loyalty-points .a-color-base`, `#pointsValue` | `XXXpt` 形式 |
| 販売者 | `#merchant-info a`, `#sellerProfileTriggerId` | |
| 在庫切れ | `#outOfStock` | 要素存在で判定 |
| Prime | `#priceBadging_feature_div .a-badge-text` | "プライム" テキスト |

### 値引率・ポイント還元率の計算

```typescript
discountRatePct = Math.round((listPrice - price) / listPrice * 100)
pointRatePct    = Math.round(points / price * 100 * 10) / 10  // 小数第1位まで
```

---

## エラーハンドリング

- HTTP 4xx/5xx: `throw new Error(...)` → `scrape_jobs.errors` に記録
- HTMLRewriter が要素を見つけられない: `null` を返す (フィールドは nullable)
- 1 商品のエラーは他の商品の処理を妨げない (try/catch per ASIN)

`scrape_jobs.status` が `partial` の場合、一部商品のスクレイプが失敗しています。`errors` カラムに JSON 配列で詳細が記録されます。

---

## DOM セレクタのメンテナンス

Amazon は定期的に DOM 構造を変更します。スクレイプ結果が null ばかりになった場合は、実際のページソースと比較してセレクタを更新してください。

セレクタは `packages/scraper/src/product.ts` と `packages/scraper/src/wishlist.ts` に集約されています。

---

## 開発時のテスト

```bash
# Cron Worker をローカルで起動 (手動トリガー可能)
cd apps/scraper-worker
pnpm dev

# ブラウザまたは curl でトリガー
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```
