# Web UI 設計

## 概要

`apps/web` は Astro で構築した静的サイトです。動的なデータ表示部分は React の island コンポーネント (`client:only="react"`) として CSR で実装します。`apps/api` の Hono Worker を fetch して JSON を取得・表示します。

---

## 技術スタック

| 技術 | バージョン | 用途 |
|---|---|---|
| Astro | v5 | 静的 HTML ビルド・ルーティング |
| React | v19 | インタラクティブな island コンポーネント |
| Tailwind CSS | v4 | スタイリング |
| Recharts | v2 | 価格履歴グラフ |

---

## ページ構成

### `/` (index.astro)

ランディングページ。ウィッシュリスト管理へのリンクを表示。

### `/wishlists` (wishlists.astro)

**コンポーネント**: `WishlistList` (CSR)

機能:
- 登録済みウィッシュリストの一覧表示
- 新規ウィッシュリスト追加フォーム (`WishlistForm`)
- ウィッシュリストの有効/停止トグル
- ウィッシュリストの削除

### `/products` (products.astro)

**コンポーネント**: `ProductDetail` (CSR)

URL パラメータ:
- `?asin=XXXXXXXXXX` — 表示する商品の ASIN

機能:
- 商品メタデータの表示 (タイトル、サムネイル)
- 最新価格・ポイント・値引率のサマリーカード
- 価格履歴グラフ (`PriceHistoryChart`)

---

## React コンポーネント

### `WishlistList.tsx`

ウィッシュリスト管理の主コンポーネント。`api.wishlists.list()` でデータ取得。

### `WishlistForm.tsx`

ウィッシュリスト追加フォーム。`api.wishlists.create()` を呼び出す。

### `ProductDetail.tsx`

商品詳細コンポーネント。URL パラメータから ASIN を読み取り、`api.products.get()` + `api.products.snapshots()` でデータ取得。

### `PriceHistoryChart.tsx`

Recharts の `LineChart` を使った価格・ポイント履歴グラフ。
- X 軸: スクレイプ日時
- 左 Y 軸: 価格 (円)
- 右 Y 軸: ポイント数

---

## API クライアント (`src/lib/api.ts`)

全 API 呼び出しを集約。`PUBLIC_API_URL` 環境変数で API ベース URL を設定。

```typescript
api.wishlists.list()           // GET /api/wishlists
api.wishlists.get(id)          // GET /api/wishlists/:id
api.wishlists.create(data)     // POST /api/wishlists
api.wishlists.update(id, data) // PUT /api/wishlists/:id
api.wishlists.delete(id)       // DELETE /api/wishlists/:id
api.products.list()            // GET /api/products
api.products.get(asin)         // GET /api/products/:asin
api.products.snapshots(asin)   // GET /api/products/:asin/snapshots
```

---

## Cloudflare Pages デプロイ

```bash
cd apps/web
pnpm build           # dist/ に静的ファイルを生成
wrangler pages deploy dist --project-name tsundoku-tools-web
```

`public/_redirects` に `/* /index.html 200` が設定されており、全パスを SPA として扱います。

### 環境変数

Cloudflare Pages の設定画面または `wrangler pages deploy` 時に設定:

```
PUBLIC_API_URL = https://tsundoku-tools-api.YOUR_SUBDOMAIN.workers.dev
```

---

## 認証

現在、認証機能は実装していません。ローカルホストまたは VPN 経由での利用を想定しています。本番公開する場合は Cloudflare Access または Basic 認証の追加を検討してください。
