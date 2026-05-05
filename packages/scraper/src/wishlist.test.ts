import type { Page } from "@cloudflare/puppeteer";
import { toAmazonListId } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "./rate-limiter.js";
import { scrapeWishlist } from "./wishlist.js";

const noOpLimiter = {
  acquire: vi.fn().mockResolvedValue(undefined),
} as unknown as RateLimiter;

const LIST_ID = toAmazonListId("TESTLISTID");
const WISHLIST_URL = "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID";

afterEach(() => {
  vi.clearAllMocks();
});

type RawItem = { params: string; title: string; imageSrc: string | null };

function makeWishlistPage(pages: Array<{ items: RawItem[]; nextUrl?: string }>): Page {
  let pageIndex = 0;
  return {
    goto: vi.fn().mockResolvedValue({ ok: () => true }),
    $$eval: vi.fn().mockImplementation(async () => {
      return pages[pageIndex]?.items ?? [];
    }),
    $eval: vi.fn().mockImplementation(async () => {
      const nextUrl = pages[pageIndex]?.nextUrl;
      pageIndex++;
      if (nextUrl) return nextUrl;
      throw new Error("No next page link");
    }),
    content: vi.fn().mockResolvedValue("<html><!-- wishlist empty --></html>"),
  } as unknown as Page;
}

function rawItem(asin: string, title: string, imageSrc: string | null = null): RawItem {
  return { params: `{"itemExternalId":"ASIN:${asin}"}`, title, imageSrc };
}

// ─── Basic extraction ─────────────────────────────────────────────────────────

describe("scrapeWishlist", () => {
  it("fetches the canonical wishlist URL built from the list ID", async () => {
    const page = makeWishlistPage([{ items: [] }]);
    await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(page.goto).toHaveBeenCalledWith(WISHLIST_URL, expect.any(Object));
  });

  it("extracts items from a single-page wishlist", async () => {
    const page = makeWishlistPage([
      {
        items: [
          rawItem("B0ITEM1001", "テスト商品1", "https://img.example.com/1.jpg"),
          rawItem("B0ITEM2001", "テスト商品2"),
        ],
      },
    ]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0ITEM1001");
    expect(items[0].title).toBe("テスト商品1");
    expect(items[0].url).toBe("https://www.amazon.co.jp/dp/B0ITEM1001");
    expect(items[0].imageUrl).toBe("https://img.example.com/1.jpg");
    expect(items[1].asin).toBe("B0ITEM2001");
    expect(items[1].imageUrl).toBeNull();
  });

  it("returns an empty array for a wishlist with no items", async () => {
    const page = makeWishlistPage([{ items: [] }]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(0);
  });

  it("ignores items whose ASIN does not match the 10-char pattern", async () => {
    const page = makeWishlistPage([
      {
        items: [rawItem("INVALID", "不正なASIN"), rawItem("B0VALID001", "正しいASIN商品")],
      },
    ]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B0VALID001");
  });

  it("ignores items with malformed data-reposition-action-params JSON", async () => {
    const page = makeWishlistPage([
      {
        items: [
          { params: "not-valid-json", title: "壊れたJSON", imageSrc: null },
          rawItem("B0VALID001", "正常商品"),
        ],
      },
    ]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B0VALID001");
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe("scrapeWishlist pagination", () => {
  it("follows pagination across 2 pages", async () => {
    const page = makeWishlistPage([
      {
        items: [rawItem("B0PAGE1001", "ページ1商品")],
        nextUrl: "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID?_page=2",
      },
      { items: [rawItem("B0PAGE2001", "ページ2商品")] },
    ]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("follows pagination across 3+ pages", async () => {
    const page = makeWishlistPage([
      {
        items: [rawItem("B0PAGE1001", "ページ1商品")],
        nextUrl: "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID?_page=2",
      },
      {
        items: [rawItem("B0PAGE2001", "ページ2商品")],
        nextUrl: "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID?_page=3",
      },
      { items: [rawItem("B0PAGE3001", "ページ3商品")] },
    ]);
    const items = await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(items).toHaveLength(3);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
    expect(items[2].asin).toBe("B0PAGE3001");
  });

  it("navigates to the next page URL returned by the page", async () => {
    const nextPageUrl = "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID?_page=2";
    const page = makeWishlistPage([
      { items: [rawItem("B0PAGE1001", "商品1")], nextUrl: nextPageUrl },
      { items: [rawItem("B0PAGE2001", "商品2")] },
    ]);
    await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(page.goto).toHaveBeenNthCalledWith(2, nextPageUrl, expect.any(Object));
  });

  it("calls rateLimiter.acquire once per page", async () => {
    const page = makeWishlistPage([
      {
        items: [rawItem("B0PAGE1001", "商品1")],
        nextUrl: "https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID?_page=2",
      },
      { items: [rawItem("B0PAGE2001", "商品2")] },
    ]);
    await scrapeWishlist(LIST_ID, page, noOpLimiter);
    expect(noOpLimiter.acquire).toHaveBeenCalledTimes(2);
  });
});

// ─── onEmptyPage callback ─────────────────────────────────────────────────────

describe("scrapeWishlist: onEmptyPage callback", () => {
  it("calls onEmptyPage with URL and HTML snapshot when page yields no items", async () => {
    const page = makeWishlistPage([{ items: [] }]);
    const calls: { url: string; debugHtml: string }[] = [];
    await scrapeWishlist(LIST_ID, page, noOpLimiter, (url, debugHtml) => {
      calls.push({ url, debugHtml });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(WISHLIST_URL);
    expect(calls[0].debugHtml).toContain("<!-- wishlist empty -->");
  });

  it("does not call onEmptyPage when items are found", async () => {
    const page = makeWishlistPage([{ items: [rawItem("B0ITEM1001", "商品1")] }]);
    const onEmptyPage = vi.fn();
    await scrapeWishlist(LIST_ID, page, noOpLimiter, onEmptyPage);
    expect(onEmptyPage).not.toHaveBeenCalled();
  });
});
