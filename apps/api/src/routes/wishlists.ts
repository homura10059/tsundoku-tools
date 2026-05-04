import {
  createDb,
  notifications,
  priceSnapshots,
  products,
  scrapeJobs,
  wishlistProducts,
  wishlists,
} from "@tsundoku-tools/db";
import { analyzeProduct, sendDiscordAlert, sendDiscordException } from "@tsundoku-tools/notifier";
import type { AlertThresholds } from "@tsundoku-tools/notifier";
import { RateLimiter, scrapeProduct, scrapeWishlist } from "@tsundoku-tools/scraper";
import {
  type WishlistId,
  buildAmazonProductUrl,
  extractWishlistId,
  nowIso,
  toWishlistId,
} from "@tsundoku-tools/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Bindings } from "../index.js";
import { problem } from "../lib/problem.js";

export const wishlistsRouter = new Hono<{ Bindings: Bindings }>();

wishlistsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(wishlists).orderBy(wishlists.createdAt);
  return c.json(rows);
});

wishlistsRouter.get("/:id", async (c) => {
  let wishlistId: WishlistId;
  try {
    wishlistId = toWishlistId(c.req.param("id"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid wishlist ID format.");
  }
  const db = createDb(c.env.DB);
  const row = await db.select().from(wishlists).where(eq(wishlists.id, wishlistId)).get();
  if (!row) return problem(c, 404, "Not Found", "Wishlist not found.");
  return c.json(row);
});

wishlistsRouter.post("/", async (c) => {
  const body = await c.req.json<{ label: string; url: string }>();
  const amazonListId = extractWishlistId(body.url);
  if (!amazonListId) {
    return problem(c, 400, "Bad Request", "Invalid Amazon wishlist URL.");
  }

  const db = createDb(c.env.DB);
  const now = nowIso();
  const id = toWishlistId(crypto.randomUUID());

  const [row] = await db
    .insert(wishlists)
    .values({ id, amazonListId, label: body.label, url: body.url, createdAt: now, updatedAt: now })
    .returning();

  return c.json(row, 201);
});

wishlistsRouter.put("/:id", async (c) => {
  let wishlistId: WishlistId;
  try {
    wishlistId = toWishlistId(c.req.param("id"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid wishlist ID format.");
  }
  const db = createDb(c.env.DB);
  const body =
    await c.req.json<
      Partial<{ label: string; url: string; isActive: boolean; scrapeIntervalMinutes: number }>
    >();

  const updates: Partial<typeof wishlists.$inferInsert> = { updatedAt: nowIso() };
  if (body.label !== undefined) updates.label = body.label;
  if (body.url !== undefined) {
    const amazonListId = extractWishlistId(body.url);
    if (!amazonListId) return problem(c, 400, "Bad Request", "Invalid Amazon wishlist URL.");
    updates.url = body.url;
    updates.amazonListId = amazonListId;
  }
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.scrapeIntervalMinutes !== undefined)
    updates.scrapeIntervalMinutes = body.scrapeIntervalMinutes;

  const [row] = await db
    .update(wishlists)
    .set(updates)
    .where(eq(wishlists.id, wishlistId))
    .returning();

  if (!row) return problem(c, 404, "Not Found", "Wishlist not found.");
  return c.json(row);
});

wishlistsRouter.delete("/:id", async (c) => {
  let wishlistId: WishlistId;
  try {
    wishlistId = toWishlistId(c.req.param("id"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid wishlist ID format.");
  }
  const db = createDb(c.env.DB);
  await db.delete(wishlists).where(eq(wishlists.id, wishlistId));
  return c.body(null, 204);
});

wishlistsRouter.get("/:id/products", async (c) => {
  let wishlistId: WishlistId;
  try {
    wishlistId = toWishlistId(c.req.param("id"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid wishlist ID format.");
  }
  const db = createDb(c.env.DB);
  const links = await db
    .select({ asin: wishlistProducts.asin })
    .from(wishlistProducts)
    .where(eq(wishlistProducts.wishlistId, wishlistId));
  if (links.length === 0) return c.json([]);
  const asins = links.map((l) => l.asin);
  const rows = await db
    .select()
    .from(products)
    .where(inArray(products.asin, asins))
    .orderBy(products.title);
  return c.json(rows);
});

wishlistsRouter.post("/:id/scrape", async (c) => {
  let wishlistId: WishlistId;
  try {
    wishlistId = toWishlistId(c.req.param("id"));
  } catch {
    return problem(c, 400, "Bad Request", "Invalid wishlist ID format.");
  }
  const db = createDb(c.env.DB);
  const wishlist = await db.select().from(wishlists).where(eq(wishlists.id, wishlistId)).get();
  if (!wishlist) return problem(c, 404, "Not Found", "Wishlist not found.");

  const jobId = crypto.randomUUID();
  const startedAt = nowIso();
  await db.insert(scrapeJobs).values({
    id: jobId,
    wishlistId: wishlist.id,
    startedAt,
    status: "running",
  });

  const env = c.env;

  c.executionCtx.waitUntil(
    (async () => {
      const rateLimiter = new RateLimiter(1);
      const thresholds: AlertThresholds = {
        minPriceDropPct: Number(env.NOTIFY_MIN_PRICE_DROP_PCT ?? 5),
        minPointChange: Number(env.NOTIFY_MIN_POINT_CHANGE ?? 50),
        cooldownHours: Number(env.NOTIFY_COOLDOWN_HOURS ?? 6),
      };

      const errors: string[] = [];
      let scraped = 0;

      try {
        const items = await scrapeWishlist(wishlist.amazonListId, rateLimiter);

        for (const item of items) {
          try {
            const url = buildAmazonProductUrl(item.asin);
            const result = await scrapeProduct(item.asin, url, rateLimiter);
            const now = nowIso();

            await db
              .insert(products)
              .values({
                asin: item.asin,
                title: item.title,
                url,
                imageUrl: item.imageUrl,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: products.asin,
                set: { title: item.title, imageUrl: item.imageUrl, updatedAt: now },
              });

            await db
              .insert(wishlistProducts)
              .values({
                id: crypto.randomUUID(),
                wishlistId: wishlist.id,
                asin: item.asin,
                addedAt: now,
              })
              .onConflictDoNothing();

            await db.insert(priceSnapshots).values({
              id: crypto.randomUUID(),
              scrapedAt: now,
              ...result,
            });

            const snapshots = await db
              .select()
              .from(priceSnapshots)
              .where(eq(priceSnapshots.asin, item.asin))
              .orderBy(desc(priceSnapshots.scrapedAt))
              .limit(2);

            const recentNotifs = await db
              .select()
              .from(notifications)
              .where(eq(notifications.asin, item.asin))
              .orderBy(desc(notifications.sentAt))
              .limit(20);

            const alerts = analyzeProduct(
              item.asin,
              item.title,
              url,
              snapshots,
              recentNotifs,
              thresholds,
            );

            for (const alert of alerts) {
              if (env.DISCORD_WEBHOOK_URL) {
                await sendDiscordAlert(env.DISCORD_WEBHOOK_URL, alert);
              }
              await db.insert(notifications).values({
                id: crypto.randomUUID(),
                asin: item.asin,
                notificationType: alert.type,
                oldValue: alert.oldValue,
                newValue: alert.newValue,
                changePct: alert.changePct,
                sentAt: nowIso(),
              });
            }

            scraped++;
          } catch (err) {
            errors.push(`${item.asin}: ${String(err)}`);
          }
        }

        const finalStatus = errors.length > 0 ? "partial" : "success";
        await db
          .update(scrapeJobs)
          .set({
            finishedAt: nowIso(),
            status: finalStatus,
            productsScraped: scraped,
            errors: errors.length > 0 ? JSON.stringify(errors) : null,
          })
          .where(eq(scrapeJobs.id, jobId));

        if (finalStatus === "partial" && env.DISCORD_ERROR_WEBHOOK_URL) {
          await sendDiscordException(env.DISCORD_ERROR_WEBHOOK_URL, {
            jobId,
            wishlistUrl: wishlist.url,
            status: "partial",
            errors,
          });
        }
      } catch (err) {
        await db
          .update(scrapeJobs)
          .set({
            finishedAt: nowIso(),
            status: "failed",
            errors: JSON.stringify([String(err)]),
          })
          .where(eq(scrapeJobs.id, jobId));

        if (env.DISCORD_ERROR_WEBHOOK_URL) {
          await sendDiscordException(env.DISCORD_ERROR_WEBHOOK_URL, {
            jobId,
            wishlistUrl: wishlist.url,
            status: "failed",
            errors: [String(err)],
          });
        }
      }
    })(),
  );

  return c.json({ jobId }, 202);
});
