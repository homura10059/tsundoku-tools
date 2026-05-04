import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tsundoku-tools/db", () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "from", "where", "orderBy", "limit"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.get = vi.fn().mockResolvedValue(null);
    return chain;
  };
  return {
    createDb: vi.fn(() => makeChain()),
    products: {},
    priceSnapshots: {},
    notifications: {},
  };
});

import { productsRouter } from "./products.js";

function makeApp() {
  const app = new Hono();
  app.route("/", productsRouter);
  return app;
}

const INVALID_ASIN = "TOOSHORT";

describe("products routes: invalid ASIN format returns 400", () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it("GET /:asin returns 400", async () => {
    const res = await app.request(`/${INVALID_ASIN}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = (await res.json()) as { title: string; detail: string };
    expect(body.title).toBe("Bad Request");
    expect(body.detail).toBe("Invalid ASIN format.");
  });

  it("GET /:asin/snapshots returns 400", async () => {
    const res = await app.request(`/${INVALID_ASIN}/snapshots`);
    expect(res.status).toBe(400);
  });

  it("GET /:asin/notifications returns 400", async () => {
    const res = await app.request(`/${INVALID_ASIN}/notifications`);
    expect(res.status).toBe(400);
  });
});
