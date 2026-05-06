import type { BrowserWorker } from "@cloudflare/puppeteer";
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
import {
  BrowserSessionManager,
  RateLimiter,
  createLogger,
  scrapeProduct,
  scrapeWishlist,
} from "@tsundoku-tools/scraper";
import { buildAmazonProductUrl, nowIso } from "@tsundoku-tools/shared";
import { desc, eq } from "drizzle-orm";

export type Env = {
  DB: D1Database;
  MYBROWSER: BrowserWorker;
  DISCORD_WEBHOOK_URL: string;
  DISCORD_ERROR_WEBHOOK_URL: string;
  NOTIFY_MIN_PRICE_DROP_PCT: string;
  NOTIFY_MIN_POINT_CHANGE: string;
  NOTIFY_COOLDOWN_HOURS: string;
  LOG_LEVEL?: string;
};

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const log = createLogger(env.LOG_LEVEL === "debug");
    const db = createDb(env.DB);
    const rateLimiter = new RateLimiter(1);
    const sessionManager = new BrowserSessionManager(log);

    const thresholds: AlertThresholds = {
      minPriceDropPct: Number(env.NOTIFY_MIN_PRICE_DROP_PCT ?? 5),
      minPointChange: Number(env.NOTIFY_MIN_POINT_CHANGE ?? 50),
      cooldownHours: Number(env.NOTIFY_COOLDOWN_HOURS ?? 6),
    };

    const activeWishlists = await db.select().from(wishlists).where(eq(wishlists.isActive, true));
    log.debug(`[scheduled] Found ${activeWishlists.length} active wishlist(s)`);

    const browser = await sessionManager.acquire(env.MYBROWSER);
    const wishlistPage = await browser.newPage();
    const productPage = await browser.newPage();
    await wishlistPage.setUserAgent(MOBILE_UA);
    await productPage.setUserAgent(DESKTOP_UA);

    try {
      for (const wishlist of activeWishlists) {
        log.debug(`[scheduled] Processing wishlist: ${wishlist.amazonListId} (${wishlist.url})`);
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
          const items = await scrapeWishlist(wishlist.amazonListId, wishlistPage, rateLimiter, {
            log,
            onEmptyPage: (emptyUrl, html) => {
              log.warn(`[scheduled] Empty wishlist page at ${emptyUrl}:\n${html}`);
            },
          });
          log.debug(`[scheduled] Wishlist ${wishlist.amazonListId}: found ${items.length} item(s)`);

          for (const item of items) {
            log.debug(`[scheduled] Scraping product: ${item.asin} "${item.title}"`);
            try {
              const url = buildAmazonProductUrl(item.asin);
              const result = await scrapeProduct(item.asin, url, productPage, rateLimiter, log);
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
              log.debug(`[scheduled] Product ${item.asin}: scraped successfully`);
            } catch (err) {
              log.error(`[scheduled] Product ${item.asin}: error — ${String(err)}`);
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

          log.debug(
            `[scheduled] Wishlist ${wishlist.amazonListId}: job done — status=${finalStatus}, scraped=${scraped}, errors=${errors.length}`,
          );

          if (finalStatus === "partial" && env.DISCORD_ERROR_WEBHOOK_URL) {
            await sendDiscordException(env.DISCORD_ERROR_WEBHOOK_URL, {
              jobId,
              wishlistUrl: wishlist.url,
              status: "partial",
              errors,
            });
          }
        } catch (err) {
          log.error(`[scheduled] Wishlist ${wishlist.amazonListId}: fatal error — ${String(err)}`);
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
      }

      await sessionManager.terminate();
    } catch (err) {
      await sessionManager.disconnect();
      throw err;
    }
  },
};
