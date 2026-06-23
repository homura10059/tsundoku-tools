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
      const errors = validate([
        kindleItem({ P_base: null, P_kindle: null }),
      ]);
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
});
