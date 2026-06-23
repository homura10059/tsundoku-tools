import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

export const config = {
  wishlistUrl: requireEnv("WISHLIST_URL"),
  discordWebhookUrl: requireEnv("DISCORD_WEBHOOK_URL"),
  discordErrorWebhookUrl: requireEnv("DISCORD_ERROR_WEBHOOK_URL"),
};
