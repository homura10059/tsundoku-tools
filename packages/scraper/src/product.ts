import type { ScrapeResult } from "@tsundoku-tools/shared";
import type { RateLimiter } from "./rate-limiter.js";

const AMAZON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
};

export async function scrapeProduct(
  asin: string,
  url: string,
  rateLimiter: RateLimiter,
): Promise<ScrapeResult> {
  await rateLimiter.acquire();

  const response = await fetch(url, { headers: AMAZON_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch product ${asin}: ${response.status}`);
  }

  return parseProductPage(asin, response);
}

async function parseProductPage(
  asin: string,
  response: Response,
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    asin,
    priceJpy: null,
    listPriceJpy: null,
    discountRatePct: null,
    points: null,
    pointRatePct: null,
    isPrime: false,
    inStock: true,
    seller: null,
    couponPct: null,
    couponJpy: null,
  };

  let priceText = "";
  let listPriceText = "";
  let pointsText = "";
  let inPriceWhole = false;
  let inListPrice = false;
  let inPoints = false;
  let inSeller = false;
  let sellerText = "";

  await new HTMLRewriter()
    .on(".a-price-whole", {
      element() {
        inPriceWhole = true;
      },
      text(chunk) {
        if (inPriceWhole) {
          priceText += chunk.text;
          if (chunk.lastInTextNode) inPriceWhole = false;
        }
      },
    })
    .on(".basisPrice .a-offscreen, #listPrice .a-offscreen", {
      text(chunk) {
        if (inListPrice) {
          listPriceText += chunk.text;
          if (chunk.lastInTextNode) inListPrice = false;
        }
      },
      element() {
        inListPrice = true;
      },
    })
    .on("#loyalty-points .a-color-base, #pointsValue", {
      element() {
        inPoints = true;
      },
      text(chunk) {
        if (inPoints) {
          pointsText += chunk.text;
          if (chunk.lastInTextNode) inPoints = false;
        }
      },
    })
    .on("#merchant-info a, #sellerProfileTriggerId", {
      element() {
        inSeller = true;
      },
      text(chunk) {
        if (inSeller) {
          sellerText += chunk.text;
          if (chunk.lastInTextNode) inSeller = false;
        }
      },
    })
    .on("#outOfStock", {
      element() {
        result.inStock = false;
      },
    })
    .on("#priceBadging_feature_div .a-badge-text", {
      text(chunk) {
        if (chunk.text.includes("プライム")) result.isPrime = true;
      },
    })
    .transform(response)
    .text();

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

function parseJpyAmount(text: string): number | null {
  const cleaned = text.replace(/[¥,\s。、]/g, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function parsePoints(text: string): number | null {
  const match = text.match(/(\d[\d,]*)\s*pt/);
  if (!match) return null;
  const num = parseInt(match[1].replace(/,/g, ""), 10);
  return isNaN(num) ? null : num;
}
