import { createDb, notifications, priceSnapshots, products } from "@tsundoku-tools/db";
import { toAsin, type Asin } from "@tsundoku-tools/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Bindings } from "../index.js";
import { problem } from "../lib/problem.js";

export const productsRouter = new Hono<{ Bindings: Bindings }>();

productsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(products).orderBy(products.title);
  return c.json(rows);
});

productsRouter.get("/:asin", async (c) => {
  let asin: Asin;
  try {
    asin = toAsin(c.req.param("asin"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid ASIN format.");
  }
  const db = createDb(c.env.DB);
  const row = await db
    .select()
    .from(products)
    .where(eq(products.asin, asin))
    .get();
  if (!row) return problem(c, 404, "Not Found", "Product not found.");
  return c.json(row);
});

productsRouter.get("/:asin/snapshots", async (c) => {
  let asin: Asin;
  try {
    asin = toAsin(c.req.param("asin"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid ASIN format.");
  }
  const db = createDb(c.env.DB);
  const limit = Number(c.req.query("limit") ?? "500");
  const rows = await db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.asin, asin))
    .orderBy(priceSnapshots.scrapedAt)
    .limit(Math.min(limit, 1000));
  return c.json(rows);
});

productsRouter.get("/:asin/notifications", async (c) => {
  let asin: Asin;
  try {
    asin = toAsin(c.req.param("asin"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid ASIN format.");
  }
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.asin, asin))
    .orderBy(notifications.sentAt);
  return c.json(rows);
});
