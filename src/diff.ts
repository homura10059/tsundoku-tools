import { extractItemKey } from "./asin.js";
import { judge } from "./judge.js";
import type { Deal, WishlistItem } from "./types.js";

/**
 * 今回の通知対象のうち、前回の巡回から「変化があった」ものだけを返す。
 *
 * 紙版が絶版になると参考価格（P_base）がマーケットプレイスのプレミア価格に
 * なり、価格が1円も動いていないのに毎日 judge() がヒットし続ける。前回の
 * スナップショットと比べて実際に状況が動いたものだけに絞ることで、この
 * 恒常的な重複通知を止める。
 *
 * 通知するのは次のいずれか:
 * - 前回スナップショットに存在しない商品（リストへの新規追加）
 * - 前回は通知対象でなかったものが今回対象になった（新規ヒット）
 * - 前回も対象で、Kindle 価格が下がった or ポイントが増えた（値下がり）
 *
 * 前回の判定には**現在の**閾値を使う。`wishlists.threshold` を引き下げた
 * 直後に新たに対象化した商品を取りこぼさないため。
 */
export function selectChangedDeals(
  deals: Deal[],
  previousItems: Map<string, WishlistItem>,
  threshold: number,
): Deal[] {
  // 前回対象だったものを Deal として持つ。judge() が P_base / P_kindle の
  // null を除外済みなので、比較時に null を気にしなくてよくなる。
  const previousDeals = new Map<string, Deal>();
  for (const [key, item] of previousItems) {
    const [deal] = judge([item], threshold);
    if (deal !== undefined) previousDeals.set(key, deal);
  }

  return deals.filter((deal) => {
    const previous = previousDeals.get(extractItemKey(deal.url));
    // 前回スナップショットにない、または前回は対象でなかった。
    if (previous === undefined) return true;
    return deal.P_kindle < previous.P_kindle || deal.Pt > previous.Pt;
  });
}
