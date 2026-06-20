import { config } from "./config.js";
import { crawl } from "./crawler.js";
import { judge } from "./judge.js";
import { notify } from "./notify.js";

const items = await crawl(config.wishlistUrl);
const deals = judge(items);

console.log(`${items.length}件中 ${deals.length}件が通知対象です。`);

if (deals.length === 0) {
  console.log("通知対象商品なし。終了します。");
} else {
  await notify(deals, config.discordWebhookUrl);
  console.log("Discord へ通知を送信しました。");
}
