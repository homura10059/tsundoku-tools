# アーキテクチャ概要

## システム概要

tsundoku-tools は Amazon.co.jp のウィッシュリストに含まれる商品の価格・ポイント情報を定期的に収集・保存し、価格変動を Discord で通知するツール群です。全コンポーネントを **Cloudflare** 上にデプロイすることで、サーバー管理コストをゼロにします。

---

## デプロイ構成

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloudflare                           │
│                                                             │
│  ┌─────────────────────┐  ┌────────────────────────────┐    │
│  │  Cloudflare Pages   │  │   Cloudflare Workers       │    │
│  │  (apps/web)         │  │   (apps/api)               │    │
│  │                     │  │                            │    │
│  │  Astro static site  │  │  Hono API Server           │    │
│  │  React islands CSR  │◄─┤  REST + Discord OAuth      │    │
│  └─────────────────────┘  └────────────┬───────────────┘    │
│                                        │ D1 SQL             │
│  ┌─────────────────────┐  ┌────────────▼───────────────┐    │
│  │  Cloudflare Workers │  │   Cloudflare D1            │    │
│  │  Cron Trigger       │  │   (SQLite 互換 DB)          │    │
│  │  (apps/scraper-     │  │                            │    │
│  │   worker)           │──►  wishlists / products      │    │
│  │                     │  │  wishlist_products         │    │
│  │  毎4時間実行         │  │  price_snapshots           │    │
│  └──────────┬──────────┘  │  notifications / scrape_jobs│   │
│             │              │  users / sessions          │    │
│             │ Puppeteer    └────────────────────────────┘    │
│  ┌──────────▼──────────┐                                     │
│  │  Browser Rendering  │                                     │
│  │  (@cloudflare/      │  外部:                              │
│  │   puppeteer)        │   Amazon.co.jp  ← Puppeteer        │
│  └─────────────────────┘   Discord       ← Webhook POST     │
└─────────────────────────────────────────────────────────────┘
```

---

## モノレポ構成

```
tsundoku-tools/
├── apps/
│   ├── web/             # Astro (静的) → Cloudflare Pages
│   ├── api/             # Hono → Cloudflare Workers
│   └── scraper-worker/  # Cron Trigger → Cloudflare Workers
├── packages/
│   ├── db/              # Drizzle スキーマ + D1 クライアント
│   ├── scraper/         # Puppeteer スクレイピングロジック
│   ├── notifier/        # 価格分析 + Discord 通知
│   └── shared/          # 共通型定義 + ユーティリティ
├── docs/
└── .github/workflows/
```

### パッケージ依存関係

```
apps/web          → shared
apps/api          → db, scraper, notifier, shared
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
    ▼ (ウィッシュリストごとに scrape_jobs レコード作成)
BrowserSessionManager.acquire() → Cloudflare Browser Rendering セッション取得/再利用
    │
    ▼
packages/scraper/wishlist.ts
  Puppeteer (モバイルUA) でウィッシュリストページを取得
  ASIN 一覧を抽出
    │
    ▼ (各ASIN に対して 1 RPS のレートリミット)
packages/scraper/product.ts
  Puppeteer (デスクトップUA) で商品ページを取得
  price/points/discount 等を抽出
    │
    ▼
D1: products UPSERT
D1: wishlist_products UPSERT
D1: price_snapshots INSERT
D1: scrape_jobs 進捗更新
    │
    ▼
packages/notifier/analyzer.ts
  直近2件のスナップショットを比較
  閾値を超えた変化を PriceAlert として返す
    │
    ▼
packages/notifier/discord.ts
  Discord Webhook に embed を POST (DISCORD_WEBHOOK_URL)
  エラー発生時は DISCORD_ERROR_WEBHOOK_URL に通知
    │
    ▼
D1: notifications INSERT (重複通知防止ログ)
```

### Web UI フロー

```
ブラウザ
  → Cloudflare Pages (Astro static HTML)
  → Discord OAuth (/auth/discord) でログイン → users/sessions に記録
  → React island (client:only) が requireAuth ミドルウェア付き API を fetch
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
| Cloudflare Browser Rendering | Amazon の JS レンダリングに対応、Workers から直接利用可能 |
| Hono | Workers 向け軽量フレームワーク、TypeScript ファースト |
| Astro + CSR | 静的ビルド可能、必要な部分だけ React でインタラクティブ化 |
| Drizzle ORM | D1 ネイティブサポート、型安全なクエリ |
| Biome | ESLint + Prettier の代替、高速・設定シンプル |
| Discord OAuth | 認証プロバイダー。既存の Discord 環境と統合 |

---

## ローカル開発環境

```bash
cd apps/api && pnpm dev             # http://localhost:8787
cd apps/web && pnpm dev             # http://localhost:4321
cd apps/scraper-worker && pnpm dev  # Cron Worker dev
```

D1 はローカル SQLite ファイルを使用 (`wrangler dev --local`)。

---

## セキュリティ考慮事項

- Web UI は Discord OAuth で認証。未ログイン状態では `/api/*` にアクセス不可
- Discord Webhook URL / OAuth シークレットは Wrangler secrets で管理（コミットしない）
- Amazon スクレイピングはレートリミッター (1 RPS) で制限
