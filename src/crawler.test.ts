import { describe, expect, it, vi } from "vitest";
import {
  SCROLL_MAX_ITERATIONS,
  parseFormat,
  parsePoints,
  parsePrice,
  parseRawItem,
  parseSafeRawItem,
  scrollToLoadAll,
} from "./crawler.js";
import type { RawItem } from "./crawler.js";

function makeMockPage(countSequence: number[]) {
  let i = 0;
  return {
    evaluate: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(countSequence[Math.min(i++, countSequence.length - 1)]),
      ),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
  };
}

const noWait = async () => {};

describe("scrollToLoadAll", () => {
  it("件数が安定したら2ラウンド後にループを終了する", async () => {
    const page = makeMockPage([0, 3, 5, 5, 5]);
    // biome-ignore lint/suspicious/noExplicitAny: mock page for testing
    await scrollToLoadAll(page as any, noWait);
    expect(page.evaluate.mock.calls.length).toBeLessThan(SCROLL_MAX_ITERATIONS);
    expect(page.keyboard.press).toHaveBeenCalledWith("End");
  });

  it("件数が増え続ける場合は SCROLL_MAX_ITERATIONS で停止する", async () => {
    let n = 0;
    const page = {
      evaluate: vi.fn().mockImplementation(() => Promise.resolve(n++)),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock page for testing
    await scrollToLoadAll(page as any, noWait);
    expect(page.evaluate).toHaveBeenCalledTimes(SCROLL_MAX_ITERATIONS);
  });
});

describe("parseFormat", () => {
  it("'Kindle版' → 'Kindle'", () => {
    expect(parseFormat("Kindle版")).toBe("Kindle");
  });

  it("'Kindle Unlimited版' → 'Kindle'", () => {
    expect(parseFormat("Kindle Unlimited版")).toBe("Kindle");
  });

  it("'単行本' → '紙'", () => {
    expect(parseFormat("単行本")).toBe("紙");
  });

  it("'文庫' → '紙'", () => {
    expect(parseFormat("文庫")).toBe("紙");
  });

  it("'ハードカバー' → '紙'", () => {
    expect(parseFormat("ハードカバー")).toBe("紙");
  });

  it("'' → 'その他'", () => {
    expect(parseFormat("")).toBe("その他");
  });

  it("'その他ガジェット' → 'その他'", () => {
    expect(parseFormat("その他ガジェット")).toBe("その他");
  });
});

describe("parsePrice", () => {
  it("2つあれば大きい方が P_base、小さい方が P_kindle", () => {
    expect(parsePrice(["¥1,500", "¥1,000"])).toEqual({
      P_base: 1500,
      P_kindle: 1000,
    });
  });

  it("1つだけなら P_base は null、P_kindle に格納", () => {
    expect(parsePrice(["¥1,000"])).toEqual({ P_base: null, P_kindle: 1000 });
  });

  it("空配列なら両方 null", () => {
    expect(parsePrice([])).toEqual({ P_base: null, P_kindle: null });
  });

  it("同額の場合は P_base と P_kindle が同じ値", () => {
    expect(parsePrice(["¥1,000", "¥1,000"])).toEqual({
      P_base: 1000,
      P_kindle: 1000,
    });
  });
});

describe("parsePoints", () => {
  it("'80pt' → 80", () => {
    expect(parsePoints("80pt")).toBe(80);
  });

  it("'80ポイント' → 80", () => {
    expect(parsePoints("80ポイント")).toBe(80);
  });

  it("'80 ポイント' → 80", () => {
    expect(parsePoints("80 ポイント")).toBe(80);
  });

  it("'' → 0", () => {
    expect(parsePoints("")).toBe(0);
  });

  it("'ポイントなし' → 0", () => {
    expect(parsePoints("ポイントなし")).toBe(0);
  });
});

describe("parseSafeRawItem", () => {
  const baseRaw: RawItem = {
    title: "テスト本",
    url: "https://www.amazon.co.jp/dp/AAAAAAAAAA",
    bylineText: "Kindle版",
    priceTexts: ["¥1,500", "¥1,000"],
    pointsText: "80ポイント",
  };

  it("有効な RawItem → WishlistItem を返す", () => {
    const result = parseSafeRawItem(baseRaw);
    expect(result?.title).toBe("テスト本");
  });

  it("不正な入力 (null) → null を返しスローしない", () => {
    expect(() => parseSafeRawItem(null as unknown as RawItem)).not.toThrow();
    expect(parseSafeRawItem(null as unknown as RawItem)).toBeNull();
  });
});

describe("parseRawItem", () => {
  const baseRaw: RawItem = {
    title: "テスト本",
    url: "https://www.amazon.co.jp/dp/AAAAAAAAAA",
    bylineText: "Kindle版",
    priceTexts: ["¥1,500", "¥1,000"],
    pointsText: "80ポイント",
  };

  it("フル RawItem → WishlistItem に変換される", () => {
    expect(parseRawItem(baseRaw)).toEqual({
      title: "テスト本",
      url: "https://www.amazon.co.jp/dp/AAAAAAAAAA",
      format: "Kindle",
      P_base: 1500,
      P_kindle: 1000,
      Pt: 80,
    });
  });

  it("相対パス URL を絶対 URL に補完する", () => {
    const raw: RawItem = { ...baseRaw, url: "/dp/AAAAAAAAAA" };
    expect(parseRawItem(raw).url).toBe(
      "https://www.amazon.co.jp/dp/AAAAAAAAAA",
    );
  });
});
