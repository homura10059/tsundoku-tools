import { describe, it, expect } from "vitest";
import { parseFormat, parsePrice } from "./crawler.js";

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
    expect(parsePrice(["¥1,500", "¥1,000"])).toEqual({ P_base: 1500, P_kindle: 1000 });
  });

  it("1つだけなら P_base は null、P_kindle に格納", () => {
    expect(parsePrice(["¥1,000"])).toEqual({ P_base: null, P_kindle: 1000 });
  });

  it("空配列なら両方 null", () => {
    expect(parsePrice([])).toEqual({ P_base: null, P_kindle: null });
  });

  it("同額の場合は P_base と P_kindle が同じ値", () => {
    expect(parsePrice(["¥1,000", "¥1,000"])).toEqual({ P_base: 1000, P_kindle: 1000 });
  });
});
