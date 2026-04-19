import {
  createDb,
  notifications,
  priceSnapshots,
  products,
  scrapeJobs,
  wishlistProducts,
  wishlists,
} from "@tsundoku-tools/db";
import { analyzeProduct, sendDiscordAlert } from "@tsundoku-tools/notifier";
import type { AlertThresholds } from "@tsundoku-tools/notifier";
import { RateLimiter, scrapeProduct, scrapeWishlist } from "@tsundoku-tools/scraper";
import { buildAmazonProductUrl, nowIso } from "@tsundoku-tools/shared";
import { eq, desc } from "drizzle-orm";

export type Env = {
  DB: D1Database;
  DISCORD_WEBHOOK_URL: string;
  NOTIFY_MIN_PRICE_DROP_PCT: string;
  NOTIFY_MIN_POINT_CHANGE: string;
  NOTIFY_COOLDOWN_HOURS: string;
};

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB);
    const rateLimiter = new RateLimiter(1);

    const thresholds: AlertThresholds = {
      minPriceDropPct: Number(env.NOTIFY_MIN_PRICE_DROP_PCT ?? 5),
      minPointChange: Number(env.NOTIFY_MIN_POINT_CHANGE ?? 50),
      cooldownHours: Number(env.NOTIFY_COOLDOWN_HOURS ?? 6),
    };

    const activeWishlists = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.isActive, true));

    for (const wishlist of activeWishlists) {
      const jobId = crypto.randomUUID();
      const startedAt = nowIso();

      await db.insert(scrapeJobs).values({
        id: jobId,
        wishlistId: wishlist.id,
        startedAt,
        status: "running",
      });

      const errors: string[] = [];
      let scraped = 0;

      try {
        const items = await scrapeWishlist(wishlist.url, rateLimiter);

        for (const item of items) {
          try {
            const url = buildAmazonProductUrl(item.asin);
            const result = await scrapeProduct(item.asin, url, rateLimiter);
            const now = nowIso();

            // Upsert product
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

            // Upsert wishlist_products
            await db
              .insert(wishlistProducts)
              .values({
                id: crypto.randomUUID(),
                wishlistId: wishlist.id,
                asin: item.asin,
                addedAt: now,
              })
              .onConflictDoNothing();

            // Insert snapshot
            await db.insert(priceSnapshots).values({
              id: crypto.randomUUID(),
              asin: item.asin,
              scrapedAt: now,
              ...result,
            });

            // Analyze and notify
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

        await db
          .update(scrapeJobs)
          .set({
            finishedAt: nowIso(),
            status: errors.length > 0 ? "partial" : "success",
            productsScraped: scraped,
            errors: errors.length > 0 ? JSON.stringify(errors) : null,
          })
          .where(eq(scrapeJobs.id, jobId));
      } catch (err) {
        await db
          .update(scrapeJobs)
          .set({
            finishedAt: nowIso(),
            status: "failed",
            errors: JSON.stringify([String(err)]),
          })
          .where(eq(scrapeJobs.id, jobId));
      }
    }
  },
};
