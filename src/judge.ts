import type { WishlistItem, Deal } from "./types.js";

const THRESHOLD = 0.20;

export function judge(items: WishlistItem[]): Deal[] {
  const deals: Deal[] = [];
  for (const item of items) {
    if (item.P_base === null || item.P_kindle === null) continue;
    const discountRate = (item.P_base - item.P_kindle) / item.P_base;
    if (discountRate >= THRESHOLD) {
      deals.push({ ...item, P_base: item.P_base, P_kindle: item.P_kindle, discountRate, pointRate: item.Pt / item.P_base });
    }
  }
  return deals;
}
