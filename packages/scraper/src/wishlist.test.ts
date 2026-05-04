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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function itemHtml(asin: string, title: string, imageUrl?: string, nameId = "001") {
  const img = imageUrl ? `<img id="itemImage_${nameId}" src="${imageUrl}">` : "";
  return `<div data-reposition-action-params='{"itemExternalId":"ASIN:${asin}"}'>
    <span id="itemName_${nameId}">${title}</span>${img}
  </div>`;
}

// 現在の Amazon Japan が返す HTML 構造: タイトルが <a>、画像が <div> の中の <img>
function newItemHtml(asin: string, title: string, imageUrl?: string, nameId = "001") {
  const imgDiv = imageUrl ? `<div id="itemImage_${nameId}"><img data-src="${imageUrl}"></div>` : "";
  return `<div data-reposition-action-params='{"itemExternalId":"ASIN:${asin}"}'>
    <a id="itemName_${nameId}">${title}</a>${imgDiv}
  </div>`;
}

function nextPageLink(page: number) {
  return `<a href="/wishlist/ls/TESTLISTID?_page=${page}">次へ</a>`;
}

// ─── scrapeWishlist (新 HTML 構造: <a id="itemName_"> / <div id="itemImage_"><img>) ───

describe("scrapeWishlist with new Amazon HTML structure", () => {
  it("extracts items when title is in <a> and image is in <div><img data-src>", async () => {
    const html = `<html><body>
      ${newItemHtml("B0ITEM1001", "テスト商品1", "https://img.example.com/1.jpg", "001")}
      ${newItemHtml("B0ITEM2001", "テスト商品2", undefined, "002")}
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0ITEM1001");
    expect(items[0].title).toBe("テスト商品1");
    expect(items[0].imageUrl).toBe("https://img.example.com/1.jpg");
    expect(items[1].asin).toBe("B0ITEM2001");
    expect(items[1].imageUrl).toBeNull();
  });

  it("extracts image when <img> has src (not data-src) inside <div id='itemImage_'>", async () => {
    const html = `<html><body>
      <div data-reposition-action-params='{"itemExternalId":"ASIN:B0ITEM1001"}'>
        <a id="itemName_001">テスト商品</a>
        <div id="itemImage_001"><img src="https://img.example.com/direct.jpg"></div>
      </div>
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(items).toHaveLength(1);
    expect(items[0].imageUrl).toBe("https://img.example.com/direct.jpg");
  });
});

// ─── scrapeWishlist: onEmptyPage callback ────────────────────────────────────

describe("scrapeWishlist: onEmptyPage callback", () => {
  it("calls onEmptyPage with URL and HTML snapshot when page yields no items", async () => {
    const html = "<html><body><!-- wishlist empty --></body></html>";
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const calls: { url: string; debugHtml: string }[] = [];
    await scrapeWishlist(LIST_ID, noOpLimiter, (url, debugHtml) => {
      calls.push({ url, debugHtml });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(WISHLIST_URL);
    expect(calls[0].debugHtml).toContain("<!-- wishlist empty -->");
  });

  it("does not call onEmptyPage when items are found", async () => {
    const html = `<html><body>${newItemHtml("B0ITEM1001", "商品1")}</body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const onEmptyPage = vi.fn();
    await scrapeWishlist(LIST_ID, noOpLimiter, onEmptyPage);

    expect(onEmptyPage).not.toHaveBeenCalled();
  });
});

// ─── scrapeWishlist (旧 HTML 構造: <span id="itemName_"> / <img id="itemImage_">) ───

describe("scrapeWishlist", () => {
  it("extracts items from a single-page wishlist", async () => {
    // ASINs must be exactly 10 uppercase alphanumeric chars
    const html = `<html><body>
      ${itemHtml("B0ITEM1001", "テスト商品1", "https://img.example.com/1.jpg", "001")}
      ${itemHtml("B0ITEM2001", "テスト商品2", undefined, "002")}
    </body></html>`;
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(html)));

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0ITEM1001");
    expect(items[0].title).toBe("テスト商品1");
    expect(items[0].url).toBe("https://www.amazon.co.jp/dp/B0ITEM1001");
    expect(items[0].imageUrl).toBe("https://img.example.com/1.jpg");
    expect(items[1].asin).toBe("B0ITEM2001");
    expect(items[1].imageUrl).toBeNull();
  });

  it("fetches the canonical wishlist URL built from the list ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html><body></body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(fetchMock).toHaveBeenCalledWith(WISHLIST_URL, expect.any(Object));
  });

  it("returns an empty array for a wishlist with no items", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html><body></body></html>")));

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

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

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

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

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

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

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(items).toHaveLength(2);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
  });

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

    const items = await scrapeWishlist(LIST_ID, noOpLimiter);

    expect(items).toHaveLength(3);
    expect(items[0].asin).toBe("B0PAGE1001");
    expect(items[1].asin).toBe("B0PAGE2001");
    expect(items[2].asin).toBe("B0PAGE3001");
  });
});
