# アーキテクチャ概要

## システム概要

tsundoku-tools は Amazon.co.jp のウィッシュリストに含まれる商品の価格・ポイント情報を定期的に収集・保存し、価格変動を Discord で通知するツール群です。全コンポーネントを **Cloudflare** 上にデプロイすることで、サーバー管理コストをゼロにします。

---

## デプロイ構成

```
┌─────────────────────────────────────────────────────────┐
│                     Cloudflare                          │
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │  Cloudflare Pages   │  │   Cloudflare Workers     │  │
│  │  (apps/web)         │  │   (apps/api)             │  │
│  │                     │  │                          │  │
│  │  Astro static site  │  │  Hono API Server         │  │
│  │  React islands CSR  │◄─┤  GET/POST/PUT/DELETE     │  │
│  └─────────────────────┘  └──────────┬───────────────┘  │
│                                      │ D1 SQL           │
│  ┌─────────────────────┐  ┌──────────▼───────────────┐  │
│  │  Cloudflare Workers │  │   Cloudflare D1          │  │
│  │  Cron Trigger       │  │   (SQLite 互換 DB)        │  │
│  │  (apps/scraper-     │  │                          │  │
│  │   worker)           │──►  wishlists               │  │
│  │                     │  │  products                │  │
│  │  毎4時間実行         │  │  price_snapshots         │  │
│  └─────────────────────┘  │  notifications           │  │
│                            │  scrape_jobs             │  │
│                            └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

外部サービス:
  Amazon.co.jp  ←── fetch() + HTMLRewriter (1 RPS)
  Discord       ←── Webhook HTTP POST
```

---

## モノレポ構成

```
tsundoku-tools/
├── apps/
│   ├── web/             # Astro (CSR) → Cloudflare Pages
│   ├── api/             # Hono → Cloudflare Workers
│   └── scraper-worker/  # Cron Trigger → Cloudflare Workers
├── packages/
│   ├── db/              # Drizzle スキーマ + D1 クライアント
│   ├── scraper/         # スクレイピングロジック
│   ├── notifier/        # 価格分析 + Discord 通知
│   └── shared/          # 共通型定義 + ユーティリティ
├── docs/
└── .github/workflows/
```

### パッケージ依存関係

```
apps/web          → shared
apps/api          → db, shared
apps/scraper-worker → db, scraper, notifier, shared
packages/notifier → db, shared
packages/scraper  → shared
packages/db       → (外部: drizzle-orm)
packages/shared   → (外部依存なし)
```

---

## データフロー

### スクレイプ実行フロー (毎4時間)

```
Cron Trigger 発火
    │
    ▼
scraper-worker: D1 から is_active=1 のウィッシュリスト取得
    │
    ▼
packages/scraper/wishlist.ts
  fetch() でウィッシュリストページ取得
  HTMLRewriter で ASIN 一覧を抽出
    │
    ▼ (各ASIN に対して 1 RPS のレートリミット)
packages/scraper/product.ts
  fetch() で商品ページ取得
  HTMLRewriter で price/points/discount 等を抽出
    │
    ▼
D1: products UPSERT
D1: price_snapshots INSERT
    │
    ▼
packages/notifier/analyzer.ts
  直近2件のスナップショットを比較
  閾値を超えた変化を PriceAlert として返す
    │
    ▼
packages/notifier/discord.ts
  Discord Webhook に embed を POST
    │
    ▼
D1: notifications INSERT (重複通知防止ログ)
```

### Web UI フロー

```
ブラウザ
  → Cloudflare Pages (Astro static HTML)
  → React island (client:only) が API Worker を fetch
  → Hono API Worker が D1 をクエリ
  → JSON レスポンスを React で描画
```

---

## 技術選定の根拠

| 技術 | 理由 |
|---|---|
| Cloudflare Workers | サーバーレス・エッジ実行、無料枠が広い |
| Cloudflare D1 | SQLite 互換、Workers ネイティブ統合 |
| Cloudflare Pages | 静的サイト + Functions の統合デプロイ |
| Hono | Workers 向け軽量フレームワーク、TypeScript ファースト |
| Astro + CSR | 静的ビルド可能、必要な部分だけ React でインタラクティブ化 |
| Drizzle ORM | D1 ネイティブサポート、型安全なクエリ |
| Biome | ESLint + Prettier の代替、高速・設定シンプル |
| fetch + HTMLRewriter | Playwright 不要、Workers ネイティブ API で DOM パース |

---

## ローカル開発環境

```
pnpm run dev          # apps/web の Astro dev server (port 4321)
cd apps/api && pnpm dev     # Hono Workers dev (port 8787)
cd apps/scraper-worker && pnpm dev  # Cron Worker dev
```

D1 はローカル SQLite ファイルを使用 (`wrangler dev --local`)。

---

## セキュリティ考慮事項

- Web UI には認証機能なし（ローカルホスト / VPN 経由での使用を想定）
- Discord Webhook URL は Wrangler secrets で管理（コミットしない）
- Amazon スクレイピングは利用規約の範囲内で 1 RPS に制限
