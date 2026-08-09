import { config } from "./config.js";
import { crawl } from "./crawler.js";
import type { D1Client } from "./d1/client.js";
import { createD1Client } from "./d1/client.js";
import { judge } from "./judge.js";
import { notify, notifyError } from "./notify.js";
import { pruneOldRuns, saveRunSnapshot } from "./repository/snapshots.js";
import { fetchEnabledWishlists } from "./repository/wishlists.js";
import type { Wishlist } from "./types.js";
import { validate } from "./validate.js";

/**
 * 1つのウィッシュリストを巡回して通知する。
 * バリデーションに失敗した場合は false を返す（呼び出し側で終了コードに反映する）。
 */
async function processWishlist(
  wishlist: Wishlist,
  d1: D1Client,
): Promise<boolean> {
  const label = `[${wishlist.name}]`;
  console.log(
    `${label} 巡回開始（閾値 ${Math.round(wishlist.threshold * 100)}%）`,
  );

  const startedAt = new Date().toISOString();
  const items = await crawl(wishlist.url);

  const kindleFoundCount = items.filter(
    (item) => item.P_kindle !== null,
  ).length;
  const baseFoundCount = items.filter((item) => item.P_base !== null).length;
  const noPaperEditionCount = items.filter(
    (item) => !item.hasPaperSwatch,
  ).length;
  const baseExtractionFailedCount = items.filter(
    (item) => item.hasPaperSwatch && item.P_base === null,
  ).length;
  console.log(
    `${label} 取得: ${items.length}件中 Kindle価格 ${kindleFoundCount}件 / ` +
      `紙版参考価格 ${baseFoundCount}件（紙版なし ${noPaperEditionCount}件 / 抽出失敗 ${baseExtractionFailedCount}件）`,
  );

  const errors = validate(items);
  // バリデーション失敗時は judge() を呼ばず、スナップショットには
  // deal_count = 0 として記録する（judge の結果自体は保存しない）。
  const deals = errors.length > 0 ? [] : judge(items, wishlist.threshold);
  const finishedAt = new Date().toISOString();

  try {
    await saveRunSnapshot(d1, {
      wishlistId: wishlist.id,
      startedAt,
      finishedAt,
      items,
      errors,
      dealCount: deals.length,
    });
  } catch (err) {
    // スナップショット保存は観測目的。失敗しても通知フローは止めない。
    console.error(
      `${label} スナップショット保存に失敗しました（警告として無視し、処理を継続します）: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (errors.length > 0) {
    console.error(
      `${label} バリデーションエラー: ${errors.map((e) => e.type).join(", ")}`,
    );
    await notifyError(errors, config.discordErrorWebhookUrl, wishlist.name);
    return false;
  }

  console.log(`${label} ${items.length}件中 ${deals.length}件が通知対象です。`);

  if (deals.length === 0) {
    console.log(`${label} 通知対象商品なし。`);
  } else {
    await notify(deals, config.discordWebhookUrl, wishlist);
    console.log(`${label} Discord へ通知を送信しました。`);
  }

  return true;
}

const d1 = createD1Client(config.d1);
const wishlists = await fetchEnabledWishlists(d1);

if (wishlists.length === 0) {
  // 設定漏れを黙って見逃さない。巡回対象が0件なのは設定ミスとみなす。
  console.error(
    "巡回対象のウィッシュリストが D1 に登録されていません（wishlists テーブルの enabled = 1 の行が0件）。",
  );
  process.exit(1);
}

console.log(`巡回対象: ${wishlists.length}件のウィッシュリスト`);

// 1つのリストが失敗しても他のリストの処理は継続し、終了コードにだけ反映する。
let allSucceeded = true;
for (const wishlist of wishlists) {
  if (!(await processWishlist(wishlist, d1))) {
    allSucceeded = false;
  }
}

try {
  await pruneOldRuns(d1);
} catch (err) {
  console.error(
    `保持期間超過分のスナップショット削除に失敗しました（警告として無視します）: ${err instanceof Error ? err.message : String(err)}`,
  );
}

if (!allSucceeded) {
  process.exit(1);
}
