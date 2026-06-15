export type Format = "Kindle" | "紙" | "その他";

export interface WishlistItem {
  title: string;
  url: string;
  format: Format;
  P_base: number | null;
  P_kindle: number | null;
  Pt: number;
}

export interface Deal extends Omit<WishlistItem, "P_base" | "P_kindle"> {
  P_base: number;
  P_kindle: number;
  discountRate: number;
  pointRate: number;
}
