import type { Format } from "./types.js";

export function parseFormat(bylineText: string): Format {
  if (bylineText.includes("Kindle")) return "Kindle";
  if (
    bylineText.includes("単行本") ||
    bylineText.includes("文庫") ||
    bylineText.includes("ハードカバー") ||
    bylineText.includes("新書") ||
    bylineText.includes("コミック")
  ) {
    return "紙";
  }
  return "その他";
}
