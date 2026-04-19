import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJpyAmount, parsePoints, scrapeProduct } from "./product.js";
import type { RateLimiter } from "./rate-limiter.js";

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

function stubFetch(html: string) {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("scrapeProduct", () => {
  it("extracts current price from .a-price-whole", async () => {
    stubFetch('<span class="a-price-whole">1,234</span>');
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.priceJpy).toBe(1234);
  });

  it("extracts list price from .basisPrice .a-offscreen", async () => {
    stubFetch('<div class="basisPrice"><span class="a-offscreen">¥1,500</span></div>');
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.listPriceJpy).toBe(1500);
  });

  it("calculates discount rate from price and list price", async () => {
    stubFetch(
      '<span class="a-price-whole">750</span><div class="basisPrice"><span class="a-offscreen">¥1,000</span></div>',
    );
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.discountRatePct).toBe(25);
  });

  it("extracts loyalty points from #loyalty-points .a-color-base", async () => {
    stubFetch(
      '<span class="a-price-whole">1,000</span><div id="loyalty-points"><span class="a-color-base">50pt</span></div>',
    );
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.points).toBe(50);
  });

  it("calculates point rate from points and price", async () => {
    stubFetch(
      '<span class="a-price-whole">1,000</span><div id="loyalty-points"><span class="a-color-base">100pt</span></div>',
    );
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.pointRatePct).toBe(10);
  });

  it("detects Prime badge", async () => {
    stubFetch(
      '<div id="priceBadging_feature_div"><span class="a-badge-text">プライム</span></div>',
    );
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.isPrime).toBe(true);
  });

  it("defaults isPrime to false when badge is absent", async () => {
    stubFetch("<html><body></body></html>");
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.isPrime).toBe(false);
  });

  it("detects out-of-stock via #outOfStock element", async () => {
    stubFetch('<div id="outOfStock">在庫切れ</div>');
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.inStock).toBe(false);
  });

  it("defaults inStock to true when #outOfStock is absent", async () => {
    stubFetch("<html><body></body></html>");
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.inStock).toBe(true);
  });

  it("extracts seller from #merchant-info a", async () => {
    stubFetch('<div id="merchant-info"><a href="/seller">ショップ名</a></div>');
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.seller).toBe("ショップ名");
  });

  it("returns null for fields missing from the HTML", async () => {
    stubFetch("<html><body></body></html>");
    const result = await scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter);
    expect(result.priceJpy).toBeNull();
    expect(result.listPriceJpy).toBeNull();
    expect(result.discountRatePct).toBeNull();
    expect(result.points).toBeNull();
    expect(result.pointRatePct).toBeNull();
    expect(result.seller).toBeNull();
  });

  it("throws when fetch returns a non-200 status", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("Not Found", { status: 404 })));
    await expect(scrapeProduct("B0TEST1234", "https://example.com", noOpLimiter)).rejects.toThrow(
      "Failed to fetch product B0TEST1234: 404",
    );
  });
});
