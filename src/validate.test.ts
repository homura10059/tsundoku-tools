import { describe, expect, it } from "vitest";
import type { WishlistItem } from "./types.js";
import { validate } from "./validate.js";

const kindleItem = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/TEST",
  format: "Kindle",
  P_base: 1000,
  P_kindle: 800,
  Pt: 0,
  hasPaperSwatch: true,
  ...overrides,
});

describe("validate", () => {
  describe("MISSING_REQUIRED_FIELDS", () => {
    it("全 item が正常 → エラーなし", () => {
      expect(validate([kindleItem()])).toHaveLength(0);
    });

    it("title が空の item が存在する → エラーあり", () => {
      const errors = validate([kindleItem({ title: "" })]);
      expect(errors).toContainEqual(
        expect.objectContaining({ type: "MISSING_REQUIRED_FIELDS" }),
      );
    });

    it("url が空の item が存在する → エラーあり", () => {
      const errors = validate([kindleItem({ url: "" })]);
      expect(errors).toContainEqual(
        expect.objectContaining({ type: "MISSING_REQUIRED_FIELDS" }),
      );
    });

    it("欠損 item のみ errors.items に含まれる", () => {
      const good = kindleItem({ title: "正常" });
      const bad = kindleItem({ title: "" });
      const errors = validate([good, bad]);
      const err = errors.find((e) => e.type === "MISSING_REQUIRED_FIELDS");
      expect(err?.items).toHaveLength(1);
      expect(err?.items[0]).toEqual(bad);
    });
  });

  describe("ALL_PRICES_MISSING", () => {
    it("全 item に価格あり → エラーなし", () => {
      expect(validate([kindleItem()])).not.toContainEqual(
        expect.objectContaining({ type: "ALL_PRICES_MISSING" }),
      );
    });

    it("全 item で P_base も P_kindle も null → エラーあり", () => {
      const errors = validate([kindleItem({ P_base: null, P_kindle: null })]);
      expect(errors).toContainEqual({ type: "ALL_PRICES_MISSING" });
    });

    it("一部 item に価格あり → エラーなし", () => {
      const withPrice = kindleItem({ P_base: 1000, P_kindle: 800 });
      const noPrice = kindleItem({ P_base: null, P_kindle: null });
      expect(validate([withPrice, noPrice])).not.toContainEqual(
        expect.objectContaining({ type: "ALL_PRICES_MISSING" }),
      );
    });

    it("items が空のとき → ALL_PRICES_MISSING は発生しない", () => {
      expect(validate([])).not.toContainEqual(
        expect.objectContaining({ type: "ALL_PRICES_MISSING" }),
      );
    });
  });

  it("複数エラーが同時に発生しうる", () => {
    const item = kindleItem({ title: "", P_base: null, P_kindle: null });
    const errors = validate([item]);
    expect(errors.some((e) => e.type === "MISSING_REQUIRED_FIELDS")).toBe(true);
    expect(errors.some((e) => e.type === "ALL_PRICES_MISSING")).toBe(true);
  });

  describe("PRICE_EXTRACTION_DEGRADED", () => {
    it("P_kindle 取得率が50%未満 → エラーあり", () => {
      const items = [
        kindleItem({ P_kindle: 800 }),
        kindleItem({ P_kindle: null, P_base: null }),
        kindleItem({ P_kindle: null, P_base: null }),
      ];
      const errors = validate(items);
      expect(errors).toContainEqual({
        type: "PRICE_EXTRACTION_DEGRADED",
        foundCount: 1,
        totalCount: 3,
      });
    });

    it("P_kindle 取得率がちょうど50% → エラーなし", () => {
      const items = [
        kindleItem({ P_kindle: 800 }),
        kindleItem({ P_kindle: null, P_base: null }),
      ];
      expect(validate(items)).not.toContainEqual(
        expect.objectContaining({ type: "PRICE_EXTRACTION_DEGRADED" }),
      );
    });

    it("ALL_PRICES_MISSING が発生する場合は重複して出さない", () => {
      const items = [kindleItem({ P_base: null, P_kindle: null })];
      const errors = validate(items);
      expect(errors).toContainEqual({ type: "ALL_PRICES_MISSING" });
      expect(errors).not.toContainEqual(
        expect.objectContaining({ type: "PRICE_EXTRACTION_DEGRADED" }),
      );
    });
  });

  describe("REFERENCE_PRICE_EXTRACTION_DEGRADED", () => {
    it("5件以上あり P_base が1件も取れていない → エラーあり", () => {
      const items = Array.from({ length: 5 }, () =>
        kindleItem({ P_base: null }),
      );
      const errors = validate(items);
      expect(errors).toContainEqual({
        type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
        totalCount: 5,
      });
    });

    it("紙版が無い商品が混ざっているだけ(P_base が一部null)ならエラーなし", () => {
      const items = [
        kindleItem({ P_base: 1000 }),
        kindleItem({ P_base: null }),
        kindleItem({ P_base: null }),
        kindleItem({ P_base: null }),
        kindleItem({ P_base: null }),
      ];
      expect(validate(items)).not.toContainEqual(
        expect.objectContaining({
          type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
        }),
      );
    });

    it("件数が閾値未満なら P_base 全滅でもエラーにしない", () => {
      const items = Array.from({ length: 4 }, () =>
        kindleItem({ P_base: null }),
      );
      expect(validate(items)).not.toContainEqual(
        expect.objectContaining({
          type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
        }),
      );
    });
  });
});
