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

  while (nextUrl) {
    await rateLimiter.acquire();
    const currentUrl = nextUrl;

    await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

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

    const items = rawItems.flatMap(({ params, title, imageSrc }) => {
      try {
        const parsed = JSON.parse(params) as { itemExternalId?: string };
        const raw = parsed.itemExternalId?.replace("ASIN:", "") ?? null;
        if (raw && /^[A-Z0-9]{10}$/.test(raw) && title) {
          const asin = toAsin(raw);
          return [{ asin, title, url: buildAmazonProductUrl(asin), imageUrl: imageSrc }];
        }
      } catch {
        // ignore malformed JSON
      }
      return [];
    });

    allItems.push(...items);

    if (items.length === 0 && onEmptyPage) {
      const html = await page.content();
      onEmptyPage(currentUrl, html.slice(0, 1500));
    }

    nextUrl = await page
      .$eval(`a[href*="_page=${currentPage + 1}"]`, (el) => {
        const href = el.getAttribute("href") ?? "";
        return href.startsWith("http") ? href : `https://www.amazon.co.jp${href}`;
      })
      .catch(() => null);

    currentPage++;
  }

  return allItems;
}
