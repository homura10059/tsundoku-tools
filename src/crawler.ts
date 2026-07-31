import { chromium } from "playwright";
import type { Page } from "playwright";
import type { Format, WishlistItem } from "./types.js";
import { jitter } from "./util/jitter.js";
import { debug } from "./util/logger.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const SELECTORS = {
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
  currentPriceText: string;
  pointsText: string;
}

export function extractRawItems(
  selectors: typeof SELECTORS,
  root: ParentNode = document,
): RawItem[] {
  function extractCurrentPriceText(
    priceAreaEl: Element | null,
    row: Element,
  ): string {
    const area = priceAreaEl ?? row;

    const offscreen = area.querySelector(".a-offscreen");
    if (offscreen?.textContent?.trim()) return offscreen.textContent.trim();

    const whole = area.querySelector(".a-price-whole");
    if (whole?.textContent?.trim()) return whole.textContent.trim();

    const match = (area.textContent ?? "").match(/[¥￥]\s*[\d,０-９]+/);
    return match ? match[0].trim() : "";
  }

  const rows = Array.from(
    root.querySelectorAll(`${selectors.itemList} ${selectors.itemRow}`),
  );

  return rows.map((row) => {
    const titleEl = row.querySelector(selectors.titleLink);
    const bylineEl = row.querySelector(selectors.byline);
    const priceAreaEl = row.querySelector(selectors.priceArea);

    const pointSpans = Array.from(row.querySelectorAll("span"))
      .map((s) => s.textContent?.trim() ?? "")
      .filter((t) => t.includes("ポイント") || /\d+pt/.test(t));

    return {
      title: titleEl?.textContent?.trim() ?? "",
      url: titleEl?.getAttribute("href") ?? "",
      bylineText: bylineEl?.textContent?.trim() ?? "",
      currentPriceText: extractCurrentPriceText(priceAreaEl, row),
      pointsText: pointSpans[0] ?? "",
    };
  });
}

export function extractReferencePriceText(root: ParentNode = document): string {
  const swatches = Array.from(
    root.querySelectorAll('[id^="tmm-grid-swatch-"]'),
  );
  const nonKindle = swatches.find((el) => el.id !== "tmm-grid-swatch-KINDLE");
  if (!nonKindle) return "";

  const priceEl = nonKindle.querySelector(".slot-price span[aria-label]");
  const label = priceEl?.getAttribute("aria-label")?.trim();
  if (label) return label;

  const text = priceEl?.textContent?.trim();
  if (text) return text;

  const match = (nonKindle.textContent ?? "").match(/[¥￥]\s*[\d,０-９]+/);
  return match ? match[0].trim() : "";
}

export function parseYenAmount(text: string): number | null {
  if (!text) return null;
  const normalized = text
    .replace(/[¥￥,\s]/g, "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const n = Number.parseInt(normalized, 10);
  return Number.isNaN(n) ? null : n;
}

export function parsePoints(pointsText: string): number {
  const match = pointsText.match(/(\d+)\s*(?:pt|ポイント)/);
  return match ? Number.parseInt(match[1], 10) : 0;
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

export const SCROLL_MAX_ITERATIONS = 20;

export async function scrollToLoadAll(
  page: Page,
  waitFn: () => Promise<void> = jitter,
): Promise<void> {
  let prevCount = 0;
  let stableRounds = 0;

  for (let i = 0; i < SCROLL_MAX_ITERATIONS; i++) {
    const currentCount = await page.evaluate(
      (sel) =>
        document.querySelectorAll(`${sel.itemList} ${sel.itemRow}`).length,
      SELECTORS,
    );

    if (currentCount === prevCount) {
      stableRounds++;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    prevCount = currentCount;

    await page.keyboard.press("End");
    await waitFn();
  }
}

async function fetchReferencePrice(
  page: Page,
  url: string,
): Promise<number | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter();
    const text = await page.evaluate<string, undefined>(
      extractReferencePriceText,
      undefined,
    );
    const P_base = parseYenAmount(text);
    debug(`[detail] P_base=${P_base}`);
    return P_base;
  } catch (err) {
    console.error("[crawler] Failed to fetch reference price:", err);
    return null;
  }
}

export async function crawl(wishlistUrl: string): Promise<WishlistItem[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    await page.goto(wishlistUrl, { waitUntil: "domcontentloaded" });
    await jitter();
    await page.waitForSelector(SELECTORS.itemList, { timeout: 10_000 });
    await scrollToLoadAll(page);

    const rawItems = await page.evaluate(extractRawItems, SELECTORS);

    const kindleItems = rawItems
      .filter((raw) => raw.title !== "")
      .map(parseSafeRawItem)
      .filter((item): item is WishlistItem => item !== null)
      .filter((item) => item.format === "Kindle");

    const items: WishlistItem[] = [];
    for (const item of kindleItems) {
      const P_base = await fetchReferencePrice(page, item.url);
      items.push({ ...item, P_base });
    }

    return items;
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
  const url = raw.url.startsWith("/")
    ? `${AMAZON_BASE_URL}${raw.url}`
    : raw.url;
  const P_kindle = parseYenAmount(raw.currentPriceText);
  const Pt = parsePoints(raw.pointsText);
  debug(`${raw.title} | P_kindle=${P_kindle} Pt=${Pt}`);
  return {
    title: raw.title,
    url,
    format: parseFormat(raw.bylineText),
    P_base: null,
    P_kindle,
    Pt,
  };
}
