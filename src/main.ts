import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { judge } from "./judge.js";
import { notify } from "./notify.js";
import type { WishlistItem } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = resolve(__dirname, "../fixtures/wishlist.json");

const items = JSON.parse(readFileSync(fixturesPath, "utf-8")) as WishlistItem[];
const deals = judge(items);

console.log(`${items.length}件中 ${deals.length}件が通知対象です。`);

if (deals.length === 0) {
  console.log("通知対象商品なし。終了します。");
} else {
  await notify(deals, config.discordWebhookUrl);
  console.log("Discord へ通知を送信しました。");
}
