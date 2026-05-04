import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tsundoku-tools/db", () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of [
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
      "delete",
      "insert",
      "update",
      "set",
      "values",
      "returning",
      "onConflictDoNothing",
      "onConflictDoUpdate",
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.get = vi.fn().mockResolvedValue(null);
    return chain;
  };
  return {
    createDb: vi.fn(() => makeChain()),
    wishlists: { id: undefined, createdAt: undefined },
    wishlistProducts: { asin: undefined, wishlistId: undefined },
    products: {},
    priceSnapshots: {},
    notifications: {},
    scrapeJobs: {},
  };
});

vi.mock("@tsundoku-tools/scraper", () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({ acquire: vi.fn() })),
  scrapeProduct: vi.fn(),
  scrapeWishlist: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tsundoku-tools/notifier", () => ({
  analyzeProduct: vi.fn().mockReturnValue([]),
  sendDiscordAlert: vi.fn(),
  sendDiscordException: vi.fn(),
}));

import { wishlistsRouter } from "./wishlists.js";

function makeApp() {
  const app = new Hono();
  app.route("/", wishlistsRouter);
  return app;
}

const INVALID_ID = "REDACTED";

describe("wishlists routes: invalid wishlist ID format returns 400", () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it("GET /:id returns 400", async () => {
    const res = await app.request(`/${INVALID_ID}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = (await res.json()) as { title: string; detail: string };
    expect(body.title).toBe("Bad Request");
    expect(body.detail).toBe("Invalid wishlist ID format.");
  });

  it("PUT /:id returns 400", async () => {
    const res = await app.request(`/${INVALID_ID}`, { method: "PUT" });
    expect(res.status).toBe(400);
  });

  it("DELETE /:id returns 400", async () => {
    const res = await app.request(`/${INVALID_ID}`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("GET /:id/products returns 400", async () => {
    const res = await app.request(`/${INVALID_ID}/products`);
    expect(res.status).toBe(400);
  });

  it("POST /:id/scrape returns 400", async () => {
    const res = await app.request(`/${INVALID_ID}/scrape`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});
