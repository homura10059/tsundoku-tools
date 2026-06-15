import { describe, it, expect } from "vitest";
import { judge } from "./judge.js";
import type { WishlistItem } from "./types.js";

const kindleItem = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/TEST",
  format: "Kindle",
  P_base: 1000,
  P_kindle: 1000,
  Pt: 0,
  ...overrides,
});

describe("judge", () => {
  it("割引率のみ20%以上 → ヒット", () => {
    const item = kindleItem({ P_base: 1000, P_kindle: 700, Pt: 0 });
    expect(judge([item])).toHaveLength(1);
  });
});
