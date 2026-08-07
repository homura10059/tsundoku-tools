import type { D1Client } from "../d1/client.js";
import { DEFAULT_THRESHOLD } from "../judge.js";
import type { Wishlist } from "../types.js";

interface WishlistRow {
  id: number;
  name: string;
  url: string;
  threshold: number | null;
}

/**
 * 巡回対象のウィッシュリストを取得する。
 *
 * threshold が NULL の行には DEFAULT_THRESHOLD を埋めて返すので、
 * 呼び出し側は NULL を意識しなくてよい。
 */
export async function fetchEnabledWishlists(
  client: D1Client,
): Promise<Wishlist[]> {
  const rows = await client.query<WishlistRow>(
    "SELECT id, name, url, threshold FROM wishlists WHERE enabled = 1 ORDER BY id",
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    threshold: row.threshold ?? DEFAULT_THRESHOLD,
  }));
}
