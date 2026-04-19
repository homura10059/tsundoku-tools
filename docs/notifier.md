# 通知システム設計

## 概要

`packages/notifier` は直近のスナップショットを比較して価格変動を検出し、Discord Webhook に通知を送信します。`apps/scraper-worker` のスクレイプ実行後に呼び出されます。

---

## ファイル構成

```
packages/notifier/src/
├── analyzer.ts   # スナップショット比較・アラート生成
├── discord.ts    # Discord embed フォーマット + POST
└── index.ts      # パブリック API の re-export
```

---

## アナライザー (`analyzer.ts`)

### 検出する変化の種類

| `NotificationType` | 発火条件 |
|---|---|
| `price_drop` | 価格が `NOTIFY_MIN_PRICE_DROP_PCT` % 以上下落 |
| `price_rise` | 価格が上昇 |
| `new_discount` | 前回は参考価格なし、今回あり (値引き開始) |
| `point_change` | ポイントが `NOTIFY_MIN_POINT_CHANGE` pt 以上変動 |
| `back_in_stock` | 在庫切れ → 在庫あり |
| `out_of_stock` | 在庫あり → 在庫切れ |

### クールダウン

同一商品・同一通知種別について、直近 `NOTIFY_COOLDOWN_HOURS` 時間以内に送信済みであればスキップします。これにより価格が細かく上下した場合の通知ラッシュを防ぎます。

### アルゴリズム

```
analyzeProduct(asin, title, productUrl, snapshots, recentNotifications, thresholds):
  snapshots[0] = 最新スナップショット (current)
  snapshots[1] = 1 つ前のスナップショット (previous)

  各変化タイプについて:
    1. 変化が発生しているか判定
    2. クールダウン期間内に同タイプの通知を送っていないか確認
    3. 条件を満たす場合 PriceAlert を生成して返す
```

---

## Discord 通知 (`discord.ts`)

### Embed フォーマット

```
タイトル: "{通知ラベル}: {商品名}"
URL: Amazon 商品ページ
カラー:
  price_drop   → 緑 (#00C851)
  price_rise   → 赤 (#FF4444)
  new_discount → 緑 (#00C851)
  point_change → 青 (#33B5E5)
  back_in_stock → 黄 (#FFBB33)
  out_of_stock  → グレー (#9E9E9E)
フィールド:
  変更前: ¥X,XXX (または Xpt)
  変更後: ¥X,XXX (または Xpt)
  変化率: +X.X% / -X.X%
タイムスタンプ: 送信日時
```

### Webhook 設定

`apps/scraper-worker/wrangler.toml` の `[vars]` または Wrangler secrets で設定:

```bash
# Wrangler secrets として設定 (推奨)
wrangler secret put DISCORD_WEBHOOK_URL
```

---

## 閾値の設定

`apps/scraper-worker/wrangler.toml` の `[vars]` または環境変数で設定:

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `NOTIFY_MIN_PRICE_DROP_PCT` | `5` | 価格下落通知の最小値引率 (%) |
| `NOTIFY_MIN_POINT_CHANGE` | `50` | ポイント変動通知の最小変化量 |
| `NOTIFY_COOLDOWN_HOURS` | `6` | 同一通知の最小送信間隔 (時間) |

---

## 新しい通知タイプの追加方法

1. `packages/shared/src/types.ts` の `NotificationType` に新しい値を追加
2. `packages/notifier/src/analyzer.ts` に検出ロジックを追加
3. `packages/notifier/src/discord.ts` の `COLORS` と `LABELS` に追加
4. 必要に応じて `packages/db/src/schema.ts` の enum 定義を更新
