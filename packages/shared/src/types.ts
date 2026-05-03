// ── Branded primitive types ────────────────────────────────────────────────
/** Internal UUID assigned to a wishlist row */
export type WishlistId = string & { readonly __name: "WishlistId" };
/** Amazon's own list identifier extracted from the wishlist URL */
export type AmazonListId = string & { readonly __name: "AmazonListId" };
/** Amazon Standard Identification Number for a product */
export type Asin = string & { readonly __name: "Asin" };

// ── Domain types ───────────────────────────────────────────────────────────
export type Wishlist = {
  id: WishlistId;
  amazonListId: AmazonListId;
  label: string;
  url: string;
  isActive: boolean;
  scrapeIntervalMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  asin: Asin;
  title: string;
  url: string;
  imageUrl: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriceSnapshot = {
  id: string;
  asin: Asin;
  scrapedAt: string;
  priceJpy: number | null;
  listPriceJpy: number | null;
  discountRatePct: number | null;
  points: number | null;
  pointRatePct: number | null;
  isPrime: boolean;
  inStock: boolean;
  seller: string | null;
  couponPct: number | null;
  couponJpy: number | null;
};

export type ScrapeResult = Omit<PriceSnapshot, "id" | "scrapedAt">;

export type WishlistItem = {
  asin: Asin;
  title: string;
  url: string;
  imageUrl: string | null;
};

export type NotificationType =
  | "price_drop"
  | "price_rise"
  | "new_discount"
  | "point_change"
  | "back_in_stock"
  | "out_of_stock";

export type PriceAlert = {
  asin: Asin;
  title: string;
  productUrl: string;
  type: NotificationType;
  oldValue: number | null;
  newValue: number | null;
  changePct: number | null;
};

export type ScrapeJobStatus = "running" | "success" | "partial" | "failed";

export type WishlistProduct = {
  id: string;
  wishlistId: WishlistId;
  asin: Asin;
  addedAt: string;
  removedAt: string | null;
};
