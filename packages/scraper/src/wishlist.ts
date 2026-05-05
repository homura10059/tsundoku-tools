import type { Page } from "@cloudflare/puppeteer";
import type { AmazonListId, WishlistItem } from "@tsundoku-tools/shared";
import { buildAmazonProductUrl, buildAmazonWishlistUrl, toAsin } from "@tsundoku-tools/shared";
import type { RateLimiter } from "./rate-limiter.js";

type RawItem = {
  params: string;
  title: string;
  imageSrc: string | null;
};

export async function scrapeWishlist(
  amazonListId: AmazonListId,
  page: Page,
  rateLimiter: RateLimiter,
  onEmptyPage?: (url: string, debugHtml: string) => void,
): Promise<WishlistItem[]> {
  const allItems: WishlistItem[] = [];
  let nextUrl: string | null = buildAmazonWishlistUrl(amazonListId);
  let currentPage = 1;

  console.log(`[scrapeWishlist] start: amazonListId=${amazonListId} firstUrl=${nextUrl}`);

  while (nextUrl) {
    await rateLimiter.acquire();
    const currentUrl = nextUrl;

    console.log(`[scrapeWishlist] page ${currentPage}: navigating to ${currentUrl}`);
    await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(
      `[scrapeWishlist] page ${currentPage}: loaded title="${pageTitle}" finalUrl=${pageUrl}`,
    );

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

    console.log(
      `[scrapeWishlist] page ${currentPage}: found ${rawItems.length} raw elements with [data-reposition-action-params]`,
    );

    const items = rawItems.flatMap(({ params, title, imageSrc }) => {
      try {
        const parsed = JSON.parse(params) as { itemExternalId?: string };
        const raw = parsed.itemExternalId?.replace("ASIN:", "") ?? null;
        if (!raw) {
          console.log(
            `[scrapeWishlist] skipped: no itemExternalId in params=${params.slice(0, 100)}`,
          );
          return [];
        }
        if (!/^[A-Z0-9]{10}$/.test(raw)) {
          console.log(`[scrapeWishlist] skipped: ASIN format invalid raw="${raw}"`);
          return [];
        }
        if (!title) {
          console.log(`[scrapeWishlist] skipped: empty title for ASIN=${raw}`);
          return [];
        }
        const asin = toAsin(raw);
        return [{ asin, title, url: buildAmazonProductUrl(asin), imageUrl: imageSrc }];
      } catch (e) {
        console.log(
          `[scrapeWishlist] skipped: JSON parse error params=${params.slice(0, 100)} err=${String(e)}`,
        );
        return [];
      }
    });

    console.log(`[scrapeWishlist] page ${currentPage}: ${items.length} valid items parsed`);

    allItems.push(...items);

    if (items.length === 0 && onEmptyPage) {
      const html = await page.content();
      onEmptyPage(currentUrl, html.slice(0, 1500));
    }

    const nextPageSelector = `a[href*="_page=${currentPage + 1}"]`;
    nextUrl = await page
      .$eval(nextPageSelector, (el) => {
        const href = el.getAttribute("href") ?? "";
        return href.startsWith("http") ? href : `https://www.amazon.co.jp${href}`;
      })
      .catch(() => null);

    console.log(`[scrapeWishlist] page ${currentPage}: next page url=${nextUrl ?? "(none)"}`);

    currentPage++;
  }

  console.log(
    `[scrapeWishlist] done: total ${allItems.length} items for amazonListId=${amazonListId}`,
  );
  return allItems;
}
