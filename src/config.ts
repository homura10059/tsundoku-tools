import "dotenv/config";
import type { D1Credentials } from "./d1/client.js";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

// 監視対象のウィッシュリストは D1 の wishlists テーブルが唯一の情報源。
// env に置くのは Cloudflare の認証情報と Discord の Webhook URL だけにする
// （シークレットは D1 に平文で置かない）。
export const config = {
  discordWebhookUrl: requireEnv("DISCORD_WEBHOOK_URL"),
  discordErrorWebhookUrl: requireEnv("DISCORD_ERROR_WEBHOOK_URL"),
  d1: {
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
    databaseId: requireEnv("CLOUDFLARE_D1_DATABASE_ID"),
  } satisfies D1Credentials,
};
