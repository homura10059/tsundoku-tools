export type Format = "Kindle" | "紙" | "その他";

/**
 * 巡回対象のウィッシュリスト（D1 の wishlists テーブル1行に対応）。
 * threshold は NULL 解決済みなので、常に有効な数値が入る。
 */
export interface Wishlist {
  id: number;
  name: string;
  url: string;
  threshold: number;
}

export interface WishlistItem {
  title: string;
  url: string;
  format: Format;
  P_base: number | null;
  P_kindle: number | null;
  Pt: number;
  // 詳細ページに紙版など Kindle 以外のスロットが存在したか。
  // P_base === null のとき、これが false なら「紙版が存在しない（正常）」、
  // true なら「スロットはあったのに価格抽出に失敗した（異常）」を意味する。
  hasPaperSwatch: boolean;
}

export interface Deal extends Omit<WishlistItem, "P_base" | "P_kindle"> {
  P_base: number;
  P_kindle: number;
  discountRate: number;
  pointRate: number;
}
