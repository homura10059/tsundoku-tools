import type { AmazonListId, Asin } from "./types.js";

export function formatPriceJpy(price: number): string {
  return `¥${price.toLocaleString("ja-JP")}`;
}

export function calcDiscountRate(price: number, listPrice: number): number {
  if (listPrice <= 0) return 0;
  return Math.round(((listPrice - price) / listPrice) * 100);
}

export function calcPointRate(points: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round((points / price) * 100 * 10) / 10;
}

export function extractAsinFromUrl(url: string): Asin | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return (match?.[1] ?? null) as Asin | null;
}

export function extractWishlistId(url: string): AmazonListId | null {
  const match = url.match(/\/wishlist\/(?:ls\/)?([A-Z0-9]+)/i);
  return (match?.[1] ?? null) as AmazonListId | null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildAmazonProductUrl(asin: Asin): string {
  return `https://www.amazon.co.jp/dp/${asin}`;
}

export function buildAmazonWishlistUrl(listId: AmazonListId): string {
  return `https://www.amazon.co.jp/wishlist/ls/${listId}`;
}
