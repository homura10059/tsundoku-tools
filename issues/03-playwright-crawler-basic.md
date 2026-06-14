# 増分3: Playwright クローラー（基本）

## 目的

データ源をフィクスチャから**実際の Amazon 公開ウィッシュリスト**へ置き換える。
この回で初めて、本物のリストに対して「取得 → 判定 → 通知」が End-to-End で動作する。まずは無限スクロール抜きの基本パース（最初に表示される範囲のみ）で薄く通す。

## スコープ

### 含む
- `src/crawler.ts`：Playwright でヘッドレスブラウザを起動し、ウィッシュリスト URL からKindleアイテムをパースして`WishlistItem[]`を返す。
  - User-Agent と ロケール（`ja-JP`）の偽装。
  - 公開リスト（ログイン不要）への遷移。
  - **初期表示分のみ**の Kindle 商品パース（基準価格・Kindle価格・付与ポイント・タイトル・URL の抽出）。
- `src/main.ts`：データ源を `crawler` の戻り値に差し替え。

### 含まない
- 無限スクロールによる全件ロード（→ 増分4）
- ジッター・商品単位のエラーハンドリングの作り込み（→ 増分4）
- 分割送信（→ 増分5）

## 実装内容

1. `src/crawler.ts`：
   - `chromium.launch({ headless: true })`、`browser.newContext({ locale: 'ja-JP', userAgent: ... })`。
   - `WISHLIST_URL` へ `page.goto`。
   - DOM セレクタで各 Kindle アイテムを抽出し、増分2で定義した `WishlistItem` 型へマッピング。
   - Kindle 形式の判定（フォーマット表記等）でフィルタ。
2. `src/main.ts`：フィクスチャ読込を `await crawl(config.wishlistUrl)` に置換。判定・通知は増分2のものを再利用。
3. セレクタは Amazon のマークアップ変更に備え、`crawler.ts` 内に定数としてまとめておく。

## 完了条件（DoD 対応）

- [ ] 実際の公開ウィッシュリスト URL を入力すると、初期表示分の Kindle 商品が取得・パースされる（**DoD 4.1 全件ロードの一部 / 実取得の確立**）。
- [ ] User-Agent / ロケール（ja-JP）が偽装されている（**要件 §2.2**）。
- [ ] 取得結果が増分2の判定・通知へそのまま流れ、End-to-End で Discord 通知が届く。

## 検証方法

1. `.env` の `WISHLIST_URL` に実在する公開ウィッシュリストを設定。
2. `pnpm start` を実行し、ログに取得件数が出ること、ヒット商品が Discord に届くことを確認。
3. （任意）`headless: false` で起動し、想定ページが開かれていることを目視確認。
