import type { PriceSnapshot, Product, Wishlist } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

const BASE = "http://localhost:8787";

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status })));
}

afterEach(() => vi.unstubAllGlobals());

const wishlist: Wishlist = {
  id: "wl-1",
  amazonListId: "LISTID",
  label: "Tech Books",
  url: "https://www.amazon.co.jp/wishlist/ls/LISTID",
  isActive: true,
  scrapeIntervalMinutes: 360,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const product: Product = {
  asin: "B0000001",
  title: "Test Product",
  url: "https://www.amazon.co.jp/dp/B0000001",
  imageUrl: null,
  category: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

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
    mockFetch(null, 204);
    await api.wishlists.delete("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1`, { method: "DELETE" });
  });

  it("products(id) calls GET /api/wishlists/:id/products", async () => {
    mockFetch([product]);
    const result = await api.wishlists.products("wl-1");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/wishlists/wl-1/products`, undefined);
    expect(result).toEqual([product]);
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
      asin: "B0000001",
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

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
    await expect(api.products.get("INVALID")).rejects.toThrow("API error 404");
  });
});
