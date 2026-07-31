// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  SELECTORS,
  extractRawItems,
  extractReferencePriceText,
} from "./crawler.js";

function loadDom(fixtureName: string): Document {
  const html = readFileSync(
    resolve(process.cwd(), "fixtures", fixtureName),
    "utf-8",
  );
  return new JSDOM(html).window.document;
}

describe("extractRawItems (実サイトのマークアップを再現したフィクスチャ)", () => {
  const document = loadDom("wishlist-listing.html");
  const items = extractRawItems(SELECTORS, document);

  it("4件のアイテムを抽出する", () => {
    expect(items).toHaveLength(4);
  });

  it("全角円記号(￥)の a-offscreen から現在価格テキストを取得する", () => {
    expect(items[0].currentPriceText).toBe("￥792");
    expect(items[0].title).toContain("フェルマーの料理");
    expect(items[0].bylineText).toBe("Kindle版");
  });

  it("2件目も同様に全角円記号で取得できる", () => {
    expect(items[1].currentPriceText).toBe("￥594");
  });

  it("a-offscreen が無い場合は a-price-whole にフォールバックする", () => {
    expect(items[2].currentPriceText).toBe("500");
  });

  it("相対URLをそのまま href として保持する(絶対化は parseRawItem 側)", () => {
    expect(items[0].url).toBe("/dp/4065162963");
  });
});

describe("extractReferencePriceText (詳細ページのフォーマットスイッチャー)", () => {
  it("KINDLE以外のスロット(紙版)の価格を全角円記号のまま取得する", () => {
    const document = loadDom("detail-page.html");
    expect(extractReferencePriceText(document)).toBe("￥825");
  });

  it("紙版スロットが存在しない場合は空文字列を返す", () => {
    const document = loadDom("detail-page-kindle-only.html");
    expect(extractReferencePriceText(document)).toBe("");
  });
});
