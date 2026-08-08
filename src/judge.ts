import type { Deal, WishlistItem } from "./types.js";

// wishlists.threshold が NULL のときに使う既定値。
export const DEFAULT_THRESHOLD = 0.2;

export function judge(
  items: WishlistItem[],
  threshold: number = DEFAULT_THRESHOLD,
): Deal[] {
  const deals: Deal[] = [];
  for (const item of items) {
    if (item.format !== "Kindle") continue;
    if (item.P_base === null || item.P_kindle === null) continue;
    const discountRate = (item.P_base - item.P_kindle) / item.P_base;
    const pointRate = item.Pt / item.P_base;
    if (discountRate >= threshold || pointRate >= threshold) {
      deals.push({
        ...item,
        P_base: item.P_base,
        P_kindle: item.P_kindle,
        discountRate,
        pointRate,
      });
    }
  }
  return deals;
}
