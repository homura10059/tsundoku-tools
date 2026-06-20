import { chromium } from "playwright";
import type { Format, WishlistItem } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SELECTORS = {
  itemList: "#g-items",
  itemRow: "li[data-id]",
  titleLink: "a[id^='itemName_']",
  byline: "span[id^='item-byline-']",
  priceArea: "[id^='itemPrice_']",
} as const;

export interface RawItem {
  title: string;
  url: string;
  bylineText: string;
  priceTexts: string[];
  pointsText: string;
}

export function parsePrice(priceTexts: string[]): { P_base: number | null; P_kindle: number | null } {
  const prices = priceTexts
    .map((t) => parseInt(t.replace(/[¥,]/g, ""), 10))
    .filter((n) => !Number.isNaN(n));

  if (prices.length === 0) return { P_base: null, P_kindle: null };
  if (prices.length === 1) return { P_base: null, P_kindle: prices[0] };

  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return { P_base: max, P_kindle: min };
}

export function parsePoints(pointsText: string): number {
  const match = pointsText.match(/(\d+)\s*(?:pt|ポイント)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function parseFormat(bylineText: string): Format {
  if (bylineText.includes("Kindle")) return "Kindle";
  if (
    bylineText.includes("単行本") ||
    bylineText.includes("文庫") ||
    bylineText.includes("ハードカバー") ||
    bylineText.includes("新書") ||
    bylineText.includes("コミック")
  ) {
    return "紙";
  }
  return "その他";
}

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

export async function crawl(wishlistUrl: string): Promise<WishlistItem[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    await page.goto(wishlistUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(SELECTORS.itemList, { timeout: 10_000 });

    const rawItems = await page.evaluate<RawItem[], typeof SELECTORS>((selectors) => {
      const rows = Array.from(
        document.querySelectorAll(`${selectors.itemList} ${selectors.itemRow}`)
      );
      return rows.map((row) => {
        const titleEl = row.querySelector(selectors.titleLink);
        const bylineEl = row.querySelector(selectors.byline);
        const priceAreaEl = row.querySelector(selectors.priceArea);

        const priceTexts = Array.from(
          (priceAreaEl ?? row).querySelectorAll("span")
        )
          .map((s) => s.textContent?.trim() ?? "")
          .filter((t) => /^¥[\d,]+$/.test(t));

        const pointSpans = Array.from(row.querySelectorAll("span"))
          .map((s) => s.textContent?.trim() ?? "")
          .filter((t) => t.includes("ポイント") || /\d+pt/.test(t));

        return {
          title: titleEl?.textContent?.trim() ?? "",
          url: titleEl?.getAttribute("href") ?? "",
          bylineText: bylineEl?.textContent?.trim() ?? "",
          priceTexts,
          pointsText: pointSpans[0] ?? "",
        };
      });
    }, SELECTORS);

    return rawItems
      .filter((raw) => raw.title !== "")
      .map(parseSafeRawItem)
      .filter((item): item is WishlistItem => item !== null)
      .filter((item) => item.format === "Kindle");
  } finally {
    await browser.close();
  }
}

export function parseSafeRawItem(raw: RawItem): WishlistItem | null {
  try {
    return parseRawItem(raw);
  } catch (err) {
    console.error("[crawler] Failed to parse item:", err);
    return null;
  }
}

export function parseRawItem(raw: RawItem): WishlistItem {
  const url = raw.url.startsWith("/") ? `${AMAZON_BASE_URL}${raw.url}` : raw.url;
  const { P_base, P_kindle } = parsePrice(raw.priceTexts);
  return {
    title: raw.title,
    url,
    format: parseFormat(raw.bylineText),
    P_base,
    P_kindle,
    Pt: parsePoints(raw.pointsText),
  };
}
