import type { Format, WishlistItem } from "./types.js";

export interface RawItem {
  title: string;
  url: string;
  bylineText: string;
  priceTexts: string[];
  pointsText: string;
}

export function parsePrice(priceTexts: string[]): { P_base: number | null; P_kindle: number | null } {
  const prices = priceTexts
    .map((t) => parseInt(t.replace(/[¥,]/g, ""), 10))
    .filter((n) => !Number.isNaN(n));

  if (prices.length === 0) return { P_base: null, P_kindle: null };
  if (prices.length === 1) return { P_base: null, P_kindle: prices[0] };

  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return { P_base: max, P_kindle: min };
}

export function parsePoints(pointsText: string): number {
  const match = pointsText.match(/(\d+)\s*(?:pt|ポイント)/);
  return match ? parseInt(match[1], 10) : 0;
}

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

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

export function parseRawItem(raw: RawItem): WishlistItem {
  const url = raw.url.startsWith("/") ? `${AMAZON_BASE_URL}${raw.url}` : raw.url;
  const { P_base, P_kindle } = parsePrice(raw.priceTexts);
  return {
    title: raw.title,
    url,
    format: parseFormat(raw.bylineText),
    P_base,
    P_kindle,
    Pt: parsePoints(raw.pointsText),
  };
}
