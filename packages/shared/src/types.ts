export type Wishlist = {
  id: string;
  amazonListId: string;
  label: string;
  url: string;
  isActive: boolean;
  scrapeIntervalMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  asin: string;
  title: string;
  url: string;
  imageUrl: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriceSnapshot = {
  id: string;
  asin: string;
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
  asin: string;
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
  asin: string;
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
  wishlistId: string;
  asin: string;
  addedAt: string;
  removedAt: string | null;
};
