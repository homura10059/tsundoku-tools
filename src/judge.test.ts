import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLD, judge } from "./judge.js";
import type { WishlistItem } from "./types.js";

const kindleItem = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/TEST",
  format: "Kindle",
  P_base: 1000,
  P_kindle: 1000,
  Pt: 0,
  hasPaperSwatch: true,
  ...overrides,
});

describe("judge", () => {
  it("割引率のみ20%以上 → ヒット", () => {
    const item = kindleItem({ P_base: 1000, P_kindle: 700, Pt: 0 });
    expect(judge([item])).toHaveLength(1);
  });

  it("ポイント還元率のみ20%以上 → ヒット", () => {
    const item = kindleItem({ P_base: 1000, P_kindle: 1000, Pt: 200 });
    expect(judge([item])).toHaveLength(1);
  });

  it("合算では20%超だが各々は20%未満 → ヒットしない", () => {
    // 割引率 13%、ポイント還元率 10%、合算 23% だがいずれも単独では20%未満
    const item = kindleItem({ P_base: 1000, P_kindle: 870, Pt: 100 });
    expect(judge([item])).toHaveLength(0);
  });

  it("Kindle以外の商品 → 除外", () => {
    const item = kindleItem({ format: "紙", P_base: 1000, P_kindle: 700 });
    expect(judge([item])).toHaveLength(0);
  });

  it("P_kindleがnullの商品 → 除外", () => {
    const item = kindleItem({ P_kindle: null });
    expect(judge([item])).toHaveLength(0);
  });

  it("閾値を指定するとその閾値で判定する", () => {
    // 割引率 30%
    const item = kindleItem({ P_base: 1000, P_kindle: 700, Pt: 0 });
    expect(judge([item], 0.3)).toHaveLength(1);
    expect(judge([item], 0.5)).toHaveLength(0);
  });

  it("閾値の指定を省略すると DEFAULT_THRESHOLD で判定する", () => {
    // 割引率 20%（DEFAULT_THRESHOLD ちょうど）
    const item = kindleItem({ P_base: 1000, P_kindle: 800, Pt: 0 });
    expect(judge([item])).toEqual(judge([item], DEFAULT_THRESHOLD));
    expect(judge([item])).toHaveLength(1);
  });

  it("ポイント還元率にも指定した閾値が使われる", () => {
    // ポイント還元率 30%
    const item = kindleItem({ P_base: 1000, P_kindle: 1000, Pt: 300 });
    expect(judge([item], 0.3)).toHaveLength(1);
    expect(judge([item], 0.5)).toHaveLength(0);
  });
});
