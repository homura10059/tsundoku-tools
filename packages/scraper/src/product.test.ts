import type { Page } from "@cloudflare/puppeteer";
import { toAsin } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJpyAmount, parsePoints, scrapeProduct } from "./product.js";
import type { RateLimiter } from "./rate-limiter.js";

const TEST_ASIN = toAsin("B0TEST1234");

// ─── parseJpyAmount ───────────────────────────────────────────────────────────

describe("parseJpyAmount", () => {
  it("parses integer with commas", () => {
    expect(parseJpyAmount("1,234")).toBe(1234);
  });

  it("parses integer with yen sign", () => {
    expect(parseJpyAmount("¥1,234")).toBe(1234);
  });

  it("parses large price with multiple comma groups", () => {
    expect(parseJpyAmount("12,345,678")).toBe(12345678);
  });

  it("returns null for empty string", () => {
    expect(parseJpyAmount("")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseJpyAmount("abc")).toBeNull();
  });
});

// ─── parsePoints ─────────────────────────────────────────────────────────────

describe("parsePoints", () => {
  it("parses plain points", () => {
    expect(parsePoints("100pt")).toBe(100);
  });

  it("parses points with comma separator", () => {
    expect(parsePoints("1,234pt")).toBe(1234);
  });

  it("parses points with surrounding whitespace", () => {
    expect(parsePoints("  500 pt  ")).toBe(500);
  });

  it("returns null for empty string", () => {
    expect(parsePoints("")).toBeNull();
  });

  it("returns null for text without pt suffix", () => {
    expect(parsePoints("100")).toBeNull();
  });
});

// ─── scrapeProduct ────────────────────────────────────────────────────────────

const noOpLimiter = {
  acquire: vi.fn().mockResolvedValue(undefined),
} as unknown as RateLimiter;

afterEach(() => {
  vi.clearAllMocks();
});

type SelectorMap = Record<string, string | boolean>;

function makeOkResponse() {
  return { ok: () => true, status: () => 200 };
}

function makePage(selectorMap: SelectorMap): Page {
  return {
    goto: vi.fn().mockResolvedValue(makeOkResponse()),
    $eval: vi.fn().mockImplementation(async (selector: string) => {
      const val = selectorMap[selector];
      if (val === undefined) throw new Error(`Selector not found: ${selector}`);
      return val;
    }),
    $: vi.fn().mockImplementation(async (selector: string) => {
      const val = selectorMap[selector];
      return val !== undefined ? {} : null;
    }),
  } as unknown as Page;
}

describe("scrapeProduct", () => {
  it("calls rateLimiter.acquire before navigating", async () => {
    const page = makePage({});
    await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(noOpLimiter.acquire).toHaveBeenCalledTimes(1);
  });

  it("navigates to the correct URL", async () => {
    const page = makePage({});
    await scrapeProduct(TEST_ASIN, "https://example.com/dp/B0TEST1234", page, noOpLimiter);
    expect(page.goto).toHaveBeenCalledWith(
      "https://example.com/dp/B0TEST1234",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
  });

  it("extracts current price from .a-price-whole", async () => {
    const page = makePage({ ".a-price-whole": "1,234" });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.priceJpy).toBe(1234);
  });

  it("extracts list price from .basisPrice .a-offscreen", async () => {
    const page = makePage({
      ".basisPrice .a-offscreen, #listPrice .a-offscreen": "¥1,500",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.listPriceJpy).toBe(1500);
  });

  it("calculates discount rate from price and list price", async () => {
    const page = makePage({
      ".a-price-whole": "750",
      ".basisPrice .a-offscreen, #listPrice .a-offscreen": "¥1,000",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.discountRatePct).toBe(25);
  });

  it("extracts loyalty points from #loyalty-points .a-color-base", async () => {
    const page = makePage({
      ".a-price-whole": "1,000",
      "#loyalty-points .a-color-base, #pointsValue": "50pt",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.points).toBe(50);
  });

  it("calculates point rate from points and price", async () => {
    const page = makePage({
      ".a-price-whole": "1,000",
      "#loyalty-points .a-color-base, #pointsValue": "100pt",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.pointRatePct).toBe(10);
  });

  it("detects Prime badge", async () => {
    const page = makePage({
      "#priceBadging_feature_div .a-badge-text": "プライム",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.isPrime).toBe(true);
  });

  it("defaults isPrime to false when badge is absent", async () => {
    const page = makePage({});
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.isPrime).toBe(false);
  });

  it("detects out-of-stock via #outOfStock element", async () => {
    const page = makePage({ "#outOfStock": true });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.inStock).toBe(false);
  });

  it("defaults inStock to true when #outOfStock is absent", async () => {
    const page = makePage({});
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.inStock).toBe(true);
  });

  it("extracts seller from #merchant-info a", async () => {
    const page = makePage({
      "#merchant-info a, #sellerProfileTriggerId": "ショップ名",
    });
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.seller).toBe("ショップ名");
  });

  it("returns null for fields missing from the page", async () => {
    const page = makePage({});
    const result = await scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter);
    expect(result.priceJpy).toBeNull();
    expect(result.listPriceJpy).toBeNull();
    expect(result.discountRatePct).toBeNull();
    expect(result.points).toBeNull();
    expect(result.pointRatePct).toBeNull();
    expect(result.seller).toBeNull();
  });

  it("throws when page navigation returns a non-200 status", async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 }),
      $eval: vi.fn(),
      $: vi.fn(),
    } as unknown as Page;
    await expect(
      scrapeProduct(TEST_ASIN, "https://example.com", page, noOpLimiter),
    ).rejects.toThrow("Failed to fetch product B0TEST1234: 404");
  });
});
