import "dotenv/config";
import { requireEnv, requireEnvList } from "./util/env.js";

export const config = {
  // カンマ区切りで複数のウィッシュリストURLを指定できる（例: "url1,url2"）。
  wishlistUrls: requireEnvList("WISHLIST_URLS"),
  discordWebhookUrl: requireEnv("DISCORD_WEBHOOK_URL"),
  discordErrorWebhookUrl: requireEnv("DISCORD_ERROR_WEBHOOK_URL"),
};
