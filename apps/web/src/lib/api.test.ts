import type { PriceSnapshot, Product, Wishlist } from "@tsundoku-tools/shared";
import { toAmazonListId, toAsin, toWishlistId } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProblemError } from "./api-error.js";
import { api, normalizeApiBase } from "./api.js";

const BASE = "http://localhost:8787";

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

const WL_ID = toWishlistId("00000000-0000-0000-0000-000000000001");

const wishlist: Wishlist = {
  id: WL_ID,
  amazonListId: toAmazonListId("LISTID"),
  label: "Tech Books",
  url: "https://www.amazon.co.jp/wishlist/ls/LISTID",
  isActive: true,
  scrapeIntervalMinutes: 360,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const PRODUCT_ASIN = toAsin("B000000001");

const product: Product = {
  asin: PRODUCT_ASIN,
  title: "Test Product",
  url: "https://www.amazon.co.jp/dp/B0000001",
  imageUrl: null,
  category: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("normalizeApiBase", () => {
  it("returns URL unchanged when it already has https scheme", () => {
    expect(normalizeApiBase("https://example.workers.dev")).toBe("https://example.workers.dev");
  });

  it("returns URL unchanged when it already has http scheme", () => {
    expect(normalizeApiBase("http://localhost:8787")).toBe("http://localhost:8787");
  });

  it("prepends https:// when scheme is missing", () => {
    expect(normalizeApiBase("example.workers.dev")).toBe("https://example.workers.dev");
  });

  it("strips trailing slash", () => {
    expect(normalizeApiBase("https://example.workers.dev/")).toBe("https://example.workers.dev");
  });

  it("prepends https:// and strips trailing slash when both apply", () => {
    expect(normalizeApiBase("example.workers.dev/")).toBe("https://example.workers.dev");
  });
});

describe("api.wishlists", () => {
  it("list() calls GET /api/wishlists", async () => {
    mockFetch([wishlist]);
    const result = await api.wishlists.list();
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists`, undefined);
    expect(result).toEqual([wishlist]);
  });

  it("get(id) calls GET /api/wishlists/:id", async () => {
    mockFetch(wishlist);
    const result = await api.wishlists.get("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1`, undefined);
    expect(result).toEqual(wishlist);
  });

  it("create(data) calls POST /api/wishlists with JSON body", async () => {
    mockFetch(wishlist, 201);
    const data = { label: "Tech Books", url: "https://www.amazon.co.jp/wishlist/ls/LISTID" };
    const result = await api.wishlists.create(data);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    expect(result).toEqual(wishlist);
  });

  it("update(id, data) calls PUT /api/wishlists/:id", async () => {
    mockFetch(wishlist);
    await api.wishlists.update("wl-1", { isActive: false });
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
  });

  it("delete(id) calls DELETE /api/wishlists/:id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await api.wishlists.delete("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1`, { method: "DELETE" });
  });

  it("products(id) calls GET /api/wishlists/:id/products", async () => {
    mockFetch([product]);
    const result = await api.wishlists.products("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1/products`, undefined);
    expect(result).toEqual([product]);
  });

  it("scrape(id) calls POST /api/wishlists/:id/scrape", async () => {
    mockFetch({ jobId: "job-1" }, 202);
    const result = await api.wishlists.scrape("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1/scrape`, { method: "POST" });
    expect(result).toEqual({ jobId: "job-1" });
  });
});

describe("api.products", () => {
  it("list() calls GET /api/products", async () => {
    mockFetch([product]);
    const result = await api.products.list();
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/products`, undefined);
    expect(result).toEqual([product]);
  });

  it("get(asin) calls GET /api/products/:asin", async () => {
    mockFetch(product);
    const result = await api.products.get("B0000001");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/products/B0000001`, undefined);
    expect(result).toEqual(product);
  });

  it("snapshots(asin) calls GET /api/products/:asin/snapshots?limit=500", async () => {
    const snapshot: PriceSnapshot = {
      id: "snap-1",
      asin: PRODUCT_ASIN,
      scrapedAt: "2024-01-01T00:00:00Z",
      priceJpy: 1000,
      listPriceJpy: 1200,
      discountRatePct: 16.67,
      points: 50,
      pointRatePct: 5,
      isPrime: true,
      inStock: true,
      seller: null,
      couponPct: null,
      couponJpy: null,
    };
    mockFetch([snapshot]);
    const result = await api.products.snapshots("B0000001");
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/products/B0000001/snapshots?limit=500`,
      undefined,
    );
    expect(result).toEqual([snapshot]);
  });

  it("throws on non-ok response with plain text body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
    await expect(api.products.get("INVALID")).rejects.toThrow("API error 404");
  });

  it("throws ApiProblemError when server returns application/problem+json", async () => {
    const problem = {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "The product was not found.",
      instance: "/api/products/INVALID",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    const err = await api.products.get("INVALID").catch((e) => e);
    expect(err).toBeInstanceOf(ApiProblemError);
    expect(err.problem).toEqual(problem);
    expect(err.message).toBe("The product was not found.");
  });

  it("ApiProblemError.message falls back to title when detail is absent", async () => {
    const problem = { type: "about:blank", title: "Unauthorized", status: 401 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    const err = await api.products.get("X").catch((e) => e);
    expect(err).toBeInstanceOf(ApiProblemError);
    expect(err.message).toBe("Unauthorized");
  });

  it("throws informative error when server returns HTML with 200 (misconfigured PUBLIC_API_URL)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html><body>index</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(api.products.get("B0000001")).rejects.toThrow(
      /HTMLレスポンスを受信|PUBLIC_API_URL/,
    );
  });
});
