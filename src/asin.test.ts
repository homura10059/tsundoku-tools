import { describe, expect, it } from "vitest";
import { extractItemKey } from "./asin.js";

describe("extractItemKey", () => {
  it("/dp/ 形式から ASIN を抽出する", () => {
    expect(extractItemKey("https://www.amazon.co.jp/dp/4065162963")).toBe(
      "4065162963",
    );
  });

  it("/gp/product/ 形式から ASIN を抽出する", () => {
    expect(
      extractItemKey("https://www.amazon.co.jp/gp/product/4065162963"),
    ).toBe("4065162963");
  });

  it("英字混じりの ASIN を大文字化して返す", () => {
    expect(extractItemKey("https://www.amazon.co.jp/dp/b08xyz1234")).toBe(
      "B08XYZ1234",
    );
  });

  it("クエリパラメータ付きでも ASIN を抽出する", () => {
    expect(
      extractItemKey(
        "https://www.amazon.co.jp/dp/4065162963?psc=1&ref_=ppx_yo",
      ),
    ).toBe("4065162963");
  });

  it("タイトルスラッグを挟む実URL形式でも ASIN を抽出する", () => {
    expect(
      extractItemKey(
        "https://www.amazon.co.jp/フェルマーの料理-1-モーニング-KC/dp/4065162963/ref=xxx",
      ),
    ).toBe("4065162963");
  });

  it("相対URLでも ASIN を抽出する", () => {
    expect(extractItemKey("/dp/4065162963")).toBe("4065162963");
  });

  it("マッチしない場合はクエリ文字列を落としたURLを返す", () => {
    expect(
      extractItemKey("https://www.amazon.co.jp/hz/wishlist/ls/AAA?ref=abc"),
    ).toBe("https://www.amazon.co.jp/hz/wishlist/ls/AAA");
  });

  it("9桁(境界値)は ASIN とみなさずフォールバックする", () => {
    expect(extractItemKey("https://www.amazon.co.jp/dp/123456789")).toBe(
      "https://www.amazon.co.jp/dp/123456789",
    );
  });

  it("11桁(境界値)は10桁だけを誤って切り出さずフォールバックする", () => {
    expect(extractItemKey("https://www.amazon.co.jp/dp/12345678901")).toBe(
      "https://www.amazon.co.jp/dp/12345678901",
    );
  });

  it("空文字列でも例外を投げない", () => {
    expect(extractItemKey("")).toBe("");
  });

  it("不正な文字列でも例外を投げない", () => {
    expect(extractItemKey("not a url")).toBe("not a url");
  });
});
