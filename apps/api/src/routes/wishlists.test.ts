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

import { createDb } from "@tsundoku-tools/db";
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

describe("POST /:id/scrape: 0-item scrape records failed status", () => {
  const VALID_ID = "25cbb930-ff0f-4f5f-9bca-1da4c5b063b6";

  it("records status:failed when scrapeWishlist returns empty array", async () => {
    const setArgs: unknown[] = [];
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValueOnce({
        id: VALID_ID,
        amazonListId: "TESTLISTID",
        url: "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID",
        label: "Test",
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((args: unknown) => {
        setArgs.push(args);
        return chain;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };
    vi.mocked(createDb).mockReturnValueOnce(chain as unknown as ReturnType<typeof createDb>);

    const capturedPromises: Promise<unknown>[] = [];
    const mockCtx = {
      waitUntil: (p: Promise<unknown>) => {
        capturedPromises.push(p);
      },
      passThroughOnException: () => {},
    };

    const app = makeApp();
    const res = await app.request(
      `/${VALID_ID}/scrape`,
      { method: "POST" },
      {} as never,
      mockCtx as never,
    );

    expect(res.status).toBe(202);
    await Promise.all(capturedPromises);

    expect(setArgs.some((a) => (a as { status?: string }).status === "failed")).toBe(true);
  });
});
