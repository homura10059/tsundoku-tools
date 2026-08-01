import { config } from "./config.js";
import { crawl } from "./crawler.js";
import { judge } from "./judge.js";
import { notify, notifyError } from "./notify.js";
import { validate } from "./validate.js";

const items = await crawl(config.wishlistUrl);

const kindleFoundCount = items.filter((item) => item.P_kindle !== null).length;
const baseFoundCount = items.filter((item) => item.P_base !== null).length;
const noPaperEditionCount = items.filter((item) => !item.hasPaperSwatch).length;
const baseExtractionFailedCount = items.filter(
  (item) => item.hasPaperSwatch && item.P_base === null,
).length;
console.log(
  `取得: ${items.length}件中 Kindle価格 ${kindleFoundCount}件 / ` +
    `紙版参考価格 ${baseFoundCount}件（紙版なし ${noPaperEditionCount}件 / 抽出失敗 ${baseExtractionFailedCount}件）`,
);

const errors = validate(items);
if (errors.length > 0) {
  console.error(
    `バリデーションエラー: ${errors.map((e) => e.type).join(", ")}`,
  );
  await notifyError(errors, config.discordErrorWebhookUrl);
  process.exit(1);
}

const deals = judge(items);

console.log(`${items.length}件中 ${deals.length}件が通知対象です。`);

if (deals.length === 0) {
  console.log("通知対象商品なし。終了します。");
} else {
  await notify(deals, config.discordWebhookUrl);
  console.log("Discord へ通知を送信しました。");
}
