import { createDb, notifications, priceSnapshots, products } from "@tsundoku-tools/db";
import type { Asin } from "@tsundoku-tools/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Bindings } from "../index.js";

export const productsRouter = new Hono<{ Bindings: Bindings }>();

productsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(products).orderBy(products.title);
  return c.json(rows);
});

productsRouter.get("/:asin", async (c) => {
  const db = createDb(c.env.DB);
  const row = await db
    .select()
    .from(products)
    .where(eq(products.asin, c.req.param("asin") as Asin))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

productsRouter.get("/:asin/snapshots", async (c) => {
  const db = createDb(c.env.DB);
  const limit = Number(c.req.query("limit") ?? "500");
  const rows = await db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.asin, c.req.param("asin") as Asin))
    .orderBy(priceSnapshots.scrapedAt)
    .limit(Math.min(limit, 1000));
  return c.json(rows);
});

productsRouter.get("/:asin/notifications", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.asin, c.req.param("asin") as Asin))
    .orderBy(notifications.sentAt);
  return c.json(rows);
});
