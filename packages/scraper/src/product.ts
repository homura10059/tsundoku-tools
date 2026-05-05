import type { Page } from "@cloudflare/puppeteer";
import type { Asin, ScrapeResult } from "@tsundoku-tools/shared";
import type { RateLimiter } from "./rate-limiter.js";

export async function scrapeProduct(
  asin: Asin,
  url: string,
  page: Page,
  rateLimiter: RateLimiter,
): Promise<ScrapeResult> {
  await rateLimiter.acquire();

  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!response?.ok()) {
    throw new Error(`Failed to fetch product ${asin}: ${response?.status() ?? "no response"}`);
  }

  const priceText = await page
    .$eval(".a-price-whole", (el) => el.textContent ?? "")
    .catch(() => "");
  const listPriceText = await page
    .$eval(".basisPrice .a-offscreen, #listPrice .a-offscreen", (el) => el.textContent ?? "")
    .catch(() => "");
  const pointsText = await page
    .$eval("#loyalty-points .a-color-base, #pointsValue", (el) => el.textContent ?? "")
    .catch(() => "");
  const sellerText = await page
    .$eval("#merchant-info a, #sellerProfileTriggerId", (el) => el.textContent ?? "")
    .catch(() => "");
  const outOfStockEl = await page.$("#outOfStock");
  const inStock = outOfStockEl === null;
  const primeBadgeText = await page
    .$eval("#priceBadging_feature_div .a-badge-text", (el) => el.textContent ?? "")
    .catch(() => "");
  const isPrime = primeBadgeText.includes("プライム");

  const result: ScrapeResult = {
    asin,
    priceJpy: null,
    listPriceJpy: null,
    discountRatePct: null,
    points: null,
    pointRatePct: null,
    isPrime,
    inStock,
    seller: null,
    couponPct: null,
    couponJpy: null,
  };

  const price = parseJpyAmount(priceText);
  if (price !== null) result.priceJpy = price;

  const listPrice = parseJpyAmount(listPriceText);
  if (listPrice !== null) result.listPriceJpy = listPrice;

  if (result.priceJpy !== null && result.listPriceJpy !== null && result.listPriceJpy > 0) {
    result.discountRatePct = Math.round(
      ((result.listPriceJpy - result.priceJpy) / result.listPriceJpy) * 100,
    );
  }

  const points = parsePoints(pointsText);
  if (points !== null) {
    result.points = points;
    if (result.priceJpy && result.priceJpy > 0) {
      result.pointRatePct = Math.round((points / result.priceJpy) * 100 * 10) / 10;
    }
  }

  if (sellerText.trim()) result.seller = sellerText.trim();

  return result;
}

export function parseJpyAmount(text: string): number | null {
  const cleaned = text.replace(/[¥,\s。、]/g, "").trim();
  const num = Number.parseInt(cleaned, 10);
  return Number.isNaN(num) ? null : num;
}

export function parsePoints(text: string): number | null {
  const match = text.match(/(\d[\d,]*)\s*pt/);
  if (!match) return null;
  const num = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isNaN(num) ? null : num;
}
