import type { AmazonListId, Asin, WishlistId } from "./types.js";

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

// ── Factory functions ──────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMAZON_LIST_ID_RE = /^[A-Z0-9]+$/i;
const ASIN_RE = /^[A-Z0-9]{10}$/;

export function toWishlistId(value: string): WishlistId {
  if (!UUID_RE.test(value)) throw new Error(`Invalid WishlistId: "${value}"`);
  return value as WishlistId;
}

export function toAmazonListId(value: string): AmazonListId {
  if (!AMAZON_LIST_ID_RE.test(value)) throw new Error(`Invalid AmazonListId: "${value}"`);
  return value as AmazonListId;
}

export function toAsin(value: string): Asin {
  if (!ASIN_RE.test(value)) throw new Error(`Invalid Asin: "${value}"`);
  return value as Asin;
}

// ── URL helpers ────────────────────────────────────────────────────────────

export function extractAsinFromUrl(url: string): Asin | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  const raw = match?.[1] ?? null;
  return raw ? toAsin(raw) : null;
}

export function extractWishlistId(url: string): AmazonListId | null {
  const match = url.match(/\/(?:hz\/)?wishlist\/(?:ls\/)?([A-Z0-9]+)/i);
  const raw = match?.[1] ?? null;
  return raw ? toAmazonListId(raw) : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildAmazonProductUrl(asin: Asin): string {
  return `https://www.amazon.co.jp/dp/${asin}`;
}

export function buildAmazonWishlistUrl(listId: AmazonListId): string {
  return `https://www.amazon.co.jp/hz/wishlist/ls/${listId}`;
}
