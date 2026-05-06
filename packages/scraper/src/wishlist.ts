import type { Page } from "@cloudflare/puppeteer";
import type { AmazonListId, WishlistItem } from "@tsundoku-tools/shared";
import { buildAmazonProductUrl, buildAmazonWishlistUrl, toAsin } from "@tsundoku-tools/shared";
import { type Logger, noopLogger } from "./logger.js";
import type { RateLimiter } from "./rate-limiter.js";

type RawItem = {
  params: string;
  title: string;
  imageSrc: string | null;
};

type ScrapeWishlistOptions = {
  onEmptyPage?: (url: string, debugHtml: string) => void;
  log?: Logger;
};

export async function scrapeWishlist(
  amazonListId: AmazonListId,
  page: Page,
  rateLimiter: RateLimiter,
  options?: ScrapeWishlistOptions,
): Promise<WishlistItem[]> {
  const { onEmptyPage, log = noopLogger } = options ?? {};
  const allItems: WishlistItem[] = [];
  let nextUrl: string | null = buildAmazonWishlistUrl(amazonListId);
  let currentPage = 1;

  log.debug(`[scrapeWishlist] Starting wishlist ${amazonListId}, first URL: ${nextUrl}`);

  while (nextUrl) {
    await rateLimiter.acquire();
    const currentUrl = nextUrl;

    await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    log.debug(`[scrapeWishlist] Page ${currentPage}: navigated to ${currentUrl}`);

    const rawItems = (await page.$$eval("[data-reposition-action-params]", (els) =>
      els.map((el) => {
        const imageEl = el.querySelector("[id^='itemImage_']");
        let imageSrc: string | null = null;
        if (imageEl) {
          if (imageEl.tagName === "IMG") {
            imageSrc = imageEl.getAttribute("data-src") ?? imageEl.getAttribute("src") ?? null;
          } else {
            const img = imageEl.querySelector("img");
            if (img) {
              imageSrc = img.getAttribute("data-src") ?? img.getAttribute("src") ?? null;
            }
          }
        }
        return {
          params: el.getAttribute("data-reposition-action-params") ?? "",
          title: el.querySelector("[id^='itemName_']")?.textContent?.trim() ?? "",
          imageSrc,
        };
      }),
    )) as RawItem[];

    log.debug(
      `[scrapeWishlist] Page ${currentPage}: found ${rawItems.length} [data-reposition-action-params] elements`,
    );

    const items = rawItems.flatMap(({ params, title, imageSrc }) => {
      let parsed: { itemExternalId?: string };
      try {
        parsed = JSON.parse(params) as { itemExternalId?: string };
      } catch (err) {
        log.debug(
          `[scrapeWishlist] Skipping item: JSON parse error (${String(err)}), params: ${params.slice(0, 100)}`,
        );
        return [];
      }

      const raw = parsed.itemExternalId?.replace("ASIN:", "") ?? null;
      if (!raw) {
        log.debug("[scrapeWishlist] Skipping item: no itemExternalId in params");
        return [];
      }
      if (!/^[A-Z0-9]{10}$/.test(raw)) {
        log.debug(`[scrapeWishlist] Skipping item: invalid ASIN format "${raw}"`);
        return [];
      }
      if (!title) {
        log.debug(`[scrapeWishlist] Skipping item: missing title for ASIN "${raw}"`);
        return [];
      }
      const asin = toAsin(raw);
      log.debug(`[scrapeWishlist] Valid item: ASIN ${asin} "${title}"`);
      return [{ asin, title, url: buildAmazonProductUrl(asin), imageUrl: imageSrc }];
    });

    log.debug(
      `[scrapeWishlist] Page ${currentPage}: ${items.length}/${rawItems.length} items valid`,
    );
    allItems.push(...items);

    if (items.length === 0) {
      const html = await page.content();
      log.warn(
        `[scrapeWishlist] Empty page (0 valid items) at ${currentUrl}, HTML snippet:\n${html.slice(0, 500)}`,
      );
      if (onEmptyPage) {
        onEmptyPage(currentUrl, html.slice(0, 1500));
      }
    }

    nextUrl = await page
      .$eval(`a[href*="_page=${currentPage + 1}"]`, (el) => {
        const href = el.getAttribute("href") ?? "";
        return href.startsWith("http") ? href : `https://www.amazon.co.jp${href}`;
      })
      .catch(() => null);

    if (nextUrl) {
      log.debug(`[scrapeWishlist] Page ${currentPage}: next page found → ${nextUrl}`);
    } else {
      log.debug(`[scrapeWishlist] Page ${currentPage}: no more pages`);
    }

    currentPage++;
  }

  log.debug(`[scrapeWishlist] Done: ${allItems.length} total items from wishlist ${amazonListId}`);
  return allItems;
}
