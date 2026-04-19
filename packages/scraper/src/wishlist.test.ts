import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "./rate-limiter.js";
import { scrapeWishlist } from "./wishlist.js";

const noOpLimiter = {
  acquire: vi.fn().mockResolvedValue(undefined),
} as unknown as RateLimiter;

const WISHLIST_URL = "https://www.amazon.co.jp/wishlist/ls/TESTLISTID";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function itemHtml(asin: string, title: string, imageUrl?: string, nameId = "001") {
  const img = imageUrl ? `<img id="itemImage_${nameId}" src="${imageUrl}">` : "";
  return `<div data-reposition-action-params='{"itemExternalId":"ASIN:${asin}"}'>
    <span id="itemName_${nameId}">${title}</span>${img}
  </div>`;
}

function nextPageLink(page: number) {
  return `<a href="/wishlist/ls/TESTLISTID?_page=${page}">次へ</a>`;
}

// ─── scrapeWishlist ───────────────────────────────────────────────────────────

describe("scrapeWishlist", () => {
  it("extracts items from a single-page wishlist", async () => {
    // ASINs must be exactly 10 uppercase alphanumeric chars
    const html = `<html><body>
      ${itemHtml("B0ITEM1001", "テスト商品1", "https://img.example.com/1.jpg", "001")}
      ${itemHtml("B0ITEM2001", "テスト商品2", undefined, "002")}
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0ITEM1001");
    expect(items[0].title).toBe("テスト商品1");
    expect(items[0].url).toBe("https://www.amazon.co.jp/dp/B0ITEM1001");
    expect(items[0].imageUrl).toBe("https://img.example.com/1.jpg");
    expect(items[1].asin).toBe("B0ITEM2001");
    expect(items[1].imageUrl).toBeNull();
  });

  it("returns an empty array for a wishlist with no items", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html><body></body></html>")));

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(0);
  });

  it("ignores items whose ASIN does not match the 10-char pattern", async () => {
    const html = `<html><body>
      <div data-reposition-action-params='{"itemExternalId":"ASIN:INVALID"}'>
        <span id="itemName_001">不正なASIN</span>
      </div>
      ${itemHtml("B0VALID001", "正しいASIN商品", undefined, "002")}
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B0VALID001");
  });

  it("ignores items with malformed data-reposition-action-params JSON", async () => {
    const html = `<html><body>
      <div data-reposition-action-params='not-valid-json'>
        <span id="itemName_001">壊れたJSON</span>
      </div>
      ${itemHtml("B0VALID001", "正常商品", undefined, "002")}
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(1);
    expect(items[0].asin).toBe("B0VALID001");
  });

  it("follows pagination across 2 pages", async () => {
    const page1 = `<html><body>
      ${itemHtml("B0PAGE1001", "ページ1商品", undefined, "001")}
      ${nextPageLink(2)}
    </body></html>`;
    const page2 = `<html><body>
      ${itemHtml("B0PAGE2001", "ページ2商品", undefined, "001")}
    </body></html>`;

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(new Response(url.includes("_page=2") ? page2 : page1)),
        ),
    );

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
  });

  // This test exposes the pagination bug: the current code only matches _page=2 links,
  // so it stops after page 2 even when page 3 exists.
  it("follows pagination across 3+ pages", async () => {
    const page1 = `<html><body>
      ${itemHtml("B0PAGE1001", "ページ1商品", undefined, "001")}
      ${nextPageLink(2)}
    </body></html>`;
    const page2 = `<html><body>
      ${itemHtml("B0PAGE2001", "ページ2商品", undefined, "001")}
      ${nextPageLink(3)}
    </body></html>`;
    const page3 = `<html><body>
      ${itemHtml("B0PAGE3001", "ページ3商品", undefined, "001")}
    </body></html>`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("_page=3")) return Promise.resolve(new Response(page3));
        if (url.includes("_page=2")) return Promise.resolve(new Response(page2));
        return Promise.resolve(new Response(page1));
      }),
    );

    const items = await scrapeWishlist(WISHLIST_URL, noOpLimiter);

    expect(items).toHaveLength(3);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
    expect(items[2].asin).toBe("B0PAGE3001");
  });
});
