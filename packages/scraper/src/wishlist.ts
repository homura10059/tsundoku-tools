import type { WishlistItem } from "@tsundoku-tools/shared";
import { buildAmazonProductUrl } from "@tsundoku-tools/shared";
import type { RateLimiter } from "./rate-limiter.js";

const AMAZON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
};

type WishlistPageResult = {
  items: WishlistItem[];
  nextPageUrl: string | null;
};

export async function scrapeWishlist(
  url: string,
  rateLimiter: RateLimiter,
): Promise<WishlistItem[]> {
  const allItems: WishlistItem[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    await rateLimiter.acquire();
    const result = await fetchWishlistPage(nextUrl);
    allItems.push(...result.items);
    nextUrl = result.nextPageUrl;
  }

  return allItems;
}

async function fetchWishlistPage(url: string): Promise<WishlistPageResult> {
  const items: WishlistItem[] = [];
  let nextPageUrl: string | null = null;

  class ItemHandler {
    currentAsin: string | null = null;
    currentTitle = "";
    currentImageUrl: string | null = null;
    inTitle = false;
  }

  const state = new ItemHandler();

  const response = await fetch(url, { headers: AMAZON_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch wishlist: ${response.status}`);
  }

  await new HTMLRewriter()
    .on("[data-reposition-action-params]", {
      element(el) {
        const params = el.getAttribute("data-reposition-action-params");
        if (params) {
          try {
            const parsed = JSON.parse(params) as { itemExternalId?: string };
            const asin = parsed.itemExternalId?.replace("ASIN:", "") ?? null;
            if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
              if (state.currentAsin && state.currentTitle) {
                items.push({
                  asin: state.currentAsin,
                  title: state.currentTitle.trim(),
                  url: buildAmazonProductUrl(state.currentAsin),
                  imageUrl: state.currentImageUrl,
                });
              }
              state.currentAsin = asin;
              state.currentTitle = "";
              state.currentImageUrl = null;
            }
          } catch {
            // ignore malformed JSON
          }
        }
      },
    })
    .on("span[id^='itemName_']", {
      element() {
        state.inTitle = true;
      },
      text(chunk) {
        if (state.inTitle) {
          state.currentTitle += chunk.text;
          if (chunk.lastInTextNode) state.inTitle = false;
        }
      },
    })
    .on("img[id^='itemImage_']", {
      element(el) {
        state.currentImageUrl = el.getAttribute("src");
      },
    })
    .on("a[href*='_page=']", {
      element(el) {
        const href = el.getAttribute("href");
        if (href?.includes("_page=2")) {
          nextPageUrl = href.startsWith("http") ? href : `https://www.amazon.co.jp${href}`;
        }
      },
    })
    .transform(response)
    .text();

  if (state.currentAsin && state.currentTitle) {
    items.push({
      asin: state.currentAsin,
      title: state.currentTitle.trim(),
      url: buildAmazonProductUrl(state.currentAsin),
      imageUrl: state.currentImageUrl,
    });
  }

  return { items, nextPageUrl };
}
