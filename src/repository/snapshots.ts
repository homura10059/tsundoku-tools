import { extractItemKey } from "../asin.js";
import type { D1Client } from "../d1/client.js";
import type { Format, WishlistItem } from "../types.js";
import type { ValidationError } from "../validate.js";

// item_snapshots は9列。Cloudflare の1クエリあたりのバウンドパラメータ
// 上限をこの開発環境からは実測できなかった（developers.cloudflare.com への
// アクセスがネットワークポリシーでブロックされている）ため、決め打ちせず
// 安全側の値（9列 × 10行 = 90パラメータ）を採用した。
// 本番リモートD1（monitor.yml run #61, 2026-08-09）で38件/24件のリストに
// 対してバッチINSERTが実際に成功することを確認済み。件数がさらに増えても
// バッチが増えるだけで安全に動くため、この値のままで問題ない。
export const ITEM_SNAPSHOT_BATCH_SIZE = 10;

// 観測ログの保持期間。pruneOldRuns() の既定値として使う。
export const SNAPSHOT_RETENTION_DAYS = 180;

export interface RunMeta {
  wishlistId: number;
  startedAt: string; // ISO8601
  finishedAt: string; // ISO8601
  items: WishlistItem[];
  dealCount: number;
}

interface RunIdRow {
  id: number;
}

/**
 * runs へ1行 INSERT し、採番された id を返す。
 *
 * D1Client.query は meta.last_row_id を返さず、かつ別クエリで
 * last_insert_rowid() を発行してもコネクション状態に依存し信頼できないため、
 * 同一クエリのレスポンスから id を得られる RETURNING 句を使う。
 */
export async function recordRun(
  client: D1Client,
  meta: RunMeta,
): Promise<number> {
  const kindlePriceFound = meta.items.filter(
    (item) => item.P_kindle !== null,
  ).length;
  const basePriceFound = meta.items.filter(
    (item) => item.P_base !== null,
  ).length;
  const paperSwatchCount = meta.items.filter(
    (item) => item.hasPaperSwatch,
  ).length;

  const rows = await client.query<RunIdRow>(
    `INSERT INTO runs
      (wishlist_id, started_at, finished_at, item_count, kindle_price_found, base_price_found, paper_swatch_count, deal_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      meta.wishlistId,
      meta.startedAt,
      meta.finishedAt,
      meta.items.length,
      kindlePriceFound,
      basePriceFound,
      paperSwatchCount,
      meta.dealCount,
    ],
  );

  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("runs への INSERT が id を返しませんでした");
  }
  return id;
}

/** item_snapshots へバッチ INSERT する。1件もなければ何もしない。 */
export async function insertItemSnapshots(
  client: D1Client,
  runId: number,
  items: WishlistItem[],
): Promise<void> {
  for (let i = 0; i < items.length; i += ITEM_SNAPSHOT_BATCH_SIZE) {
    const chunk = items.slice(i, i + ITEM_SNAPSHOT_BATCH_SIZE);
    const placeholders = chunk
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .join(", ");
    const params = chunk.flatMap((item) => [
      runId,
      extractItemKey(item.url),
      item.title,
      item.url,
      item.format,
      item.P_base,
      item.P_kindle,
      item.Pt,
      item.hasPaperSwatch ? 1 : 0,
    ]);

    await client.query(
      `INSERT INTO item_snapshots
        (run_id, item_key, title, url, format, base_price, kindle_price, points, has_paper_swatch)
       VALUES ${placeholders}`,
      params,
    );
  }
}

// undefined は「detail なし」を表す（DB には SQL NULL として保存する。
// JSON.stringify(null) の文字列 "null" とは区別する）。
function errorDetail(error: ValidationError): unknown | undefined {
  switch (error.type) {
    case "MISSING_REQUIRED_FIELDS":
      return { count: error.items.length };
    case "ALL_PRICES_MISSING":
      return undefined;
    case "PRICE_EXTRACTION_DEGRADED":
    case "REFERENCE_PRICE_EXTRACTION_DEGRADED":
      return { foundCount: error.foundCount, totalCount: error.totalCount };
  }
}

/** run_validation_errors へ INSERT する。0件なら何もしない。 */
export async function recordValidationErrors(
  client: D1Client,
  runId: number,
  errors: ValidationError[],
): Promise<void> {
  if (errors.length === 0) return;

  const placeholders = errors.map(() => "(?, ?, ?)").join(", ");
  const params = errors.flatMap((error) => {
    const detail = errorDetail(error);
    return [
      runId,
      error.type,
      detail === undefined ? null : JSON.stringify(detail),
    ];
  });

  await client.query(
    `INSERT INTO run_validation_errors (run_id, type, detail) VALUES ${placeholders}`,
    params,
  );
}

export interface SaveRunSnapshotParams {
  wishlistId: number;
  startedAt: string;
  finishedAt: string;
  items: WishlistItem[];
  errors: ValidationError[];
  dealCount: number;
}

/**
 * main.ts から呼ぶ入口。recordRun → insertItemSnapshots →
 * recordValidationErrors を順に行う。
 *
 * エラーは握りつぶさずそのまま呼び出し元に伝播する。書き込み失敗時に
 * 通知フローを止めない判断は main.ts 側の責務（try/catch で包む）。
 */
export async function saveRunSnapshot(
  client: D1Client,
  params: SaveRunSnapshotParams,
): Promise<void> {
  const runId = await recordRun(client, {
    wishlistId: params.wishlistId,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    items: params.items,
    dealCount: params.dealCount,
  });
  await insertItemSnapshots(client, runId, params.items);
  await recordValidationErrors(client, runId, params.errors);
}

interface ItemSnapshotRow {
  item_key: string;
  title: string;
  url: string;
  format: string;
  base_price: number | null;
  kindle_price: number | null;
  points: number;
  has_paper_swatch: number;
}

// format 列は TEXT なので、スキーマ変更や手作業の INSERT で Format 以外の
// 値が入りうる。判定は Kindle 以外を除外するだけなので、未知の値は安全側に
// 倒して「その他」に丸める。
function toFormat(value: string): Format {
  return value === "Kindle" || value === "紙" ? value : "その他";
}

/**
 * 指定リストの「直前の run」に属する item スナップショットを、
 * item_key をキーにした Map で返す（差分通知の比較対象）。
 *
 * 直前の run が存在しない（初回実行）場合は空の Map を返す。run はあるが
 * item が0件だった場合も空の Map になるが、どちらも「今回の全商品が新規」
 * となり通知の結果は同じなので、両者を区別する必要はない。
 *
 * 同じ run 内で item_key が重複した場合（同一 ASIN がリストに2回入って
 * いる等）は後の行で上書きする。同じ商品なら価格も同じなので実害はない。
 */
export async function fetchLatestRunItems(
  client: D1Client,
  wishlistId: number,
): Promise<Map<string, WishlistItem>> {
  // started_at が同一ミリ秒で並んだ場合に備え、id で決定的にタイブレークする。
  const rows = await client.query<ItemSnapshotRow>(
    `SELECT item_key, title, url, format, base_price, kindle_price, points, has_paper_swatch
     FROM item_snapshots
     WHERE run_id = (
       SELECT id FROM runs WHERE wishlist_id = ? ORDER BY started_at DESC, id DESC LIMIT 1
     )`,
    [wishlistId],
  );

  const items = new Map<string, WishlistItem>();
  for (const row of rows) {
    items.set(row.item_key, {
      title: row.title,
      url: row.url,
      format: toFormat(row.format),
      P_base: row.base_price,
      P_kindle: row.kindle_price,
      Pt: row.points,
      hasPaperSwatch: row.has_paper_swatch === 1,
    });
  }
  return items;
}

/**
 * 保持期間（既定 SNAPSHOT_RETENTION_DAYS）より古い runs と、その配下の
 * item_snapshots / run_validation_errors を削除する。
 *
 * スキーマ上は ON DELETE CASCADE を宣言しているが、D1 で外部キー制約が
 * 有効化されているか確証が持てないため、CASCADE には頼らず明示的に
 * 子テーブルから順に削除する。
 */
export async function pruneOldRuns(
  client: D1Client,
  retentionDays: number = SNAPSHOT_RETENTION_DAYS,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await client.query(
    "DELETE FROM item_snapshots WHERE run_id IN (SELECT id FROM runs WHERE started_at < ?)",
    [cutoff],
  );
  await client.query(
    "DELETE FROM run_validation_errors WHERE run_id IN (SELECT id FROM runs WHERE started_at < ?)",
    [cutoff],
  );
  await client.query("DELETE FROM runs WHERE started_at < ?", [cutoff]);
}
