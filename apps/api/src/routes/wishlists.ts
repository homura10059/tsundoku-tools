import { createDb, wishlistProducts, wishlists } from "@tsundoku-tools/db";
import { extractWishlistId, nowIso } from "@tsundoku-tools/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Bindings } from "../index.js";

export const wishlistsRouter = new Hono<{ Bindings: Bindings }>();

wishlistsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(wishlists).orderBy(wishlists.createdAt);
  return c.json(rows);
});

wishlistsRouter.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const row = await db
    .select()
    .from(wishlists)
    .where(eq(wishlists.id, c.req.param("id")))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

wishlistsRouter.post("/", async (c) => {
  const body = await c.req.json<{ label: string; url: string }>();
  const amazonListId = extractWishlistId(body.url);
  if (!amazonListId) {
    return c.json({ error: "Invalid Amazon wishlist URL" }, 400);
  }

  const db = createDb(c.env.DB);
  const now = nowIso();
  const id = crypto.randomUUID();

  const [row] = await db
    .insert(wishlists)
    .values({ id, amazonListId, label: body.label, url: body.url, createdAt: now, updatedAt: now })
    .returning();

  return c.json(row, 201);
});

wishlistsRouter.put("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const body =
    await c.req.json<
      Partial<{ label: string; url: string; isActive: boolean; scrapeIntervalMinutes: number }>
    >();

  const updates: Partial<typeof wishlists.$inferInsert> = { updatedAt: nowIso() };
  if (body.label !== undefined) updates.label = body.label;
  if (body.url !== undefined) {
    const amazonListId = extractWishlistId(body.url);
    if (!amazonListId) return c.json({ error: "Invalid Amazon wishlist URL" }, 400);
    updates.url = body.url;
    updates.amazonListId = amazonListId;
  }
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.scrapeIntervalMinutes !== undefined)
    updates.scrapeIntervalMinutes = body.scrapeIntervalMinutes;

  const [row] = await db
    .update(wishlists)
    .set(updates)
    .where(eq(wishlists.id, c.req.param("id")))
    .returning();

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

wishlistsRouter.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  await db.delete(wishlists).where(eq(wishlists.id, c.req.param("id")));
  return c.body(null, 204);
});

wishlistsRouter.get("/:id/products", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.query.wishlistProducts.findMany({
    where: eq(wishlistProducts.wishlistId, c.req.param("id")),
    with: { asin: true },
  });
  return c.json(rows);
});
