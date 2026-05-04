import { describe, expect, it } from "vitest";
import {
  buildAmazonWishlistUrl,
  extractWishlistId,
  toAmazonListId,
  toAsin,
  toWishlistId,
} from "./utils.js";

describe("toWishlistId", () => {
  it("returns a WishlistId for a valid UUID", () => {
    const id = toWishlistId("00000000-0000-0000-0000-000000000001");
    expect(id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("accepts uppercase UUID", () => {
    expect(() => toWishlistId("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")).not.toThrow();
  });

  it("throws for an empty string", () => {
    expect(() => toWishlistId("")).toThrow("Invalid WishlistId");
  });

  it("throws for a non-UUID string like 'wl-1'", () => {
    expect(() => toWishlistId("wl-1")).toThrow("Invalid WishlistId");
  });

  it("throws for a UUID missing the hyphens", () => {
    expect(() => toWishlistId("000000000000000000000000000000000001")).toThrow(
      "Invalid WishlistId",
    );
  });
});

describe("toAmazonListId", () => {
  it("returns an AmazonListId for a valid alphanumeric string", () => {
    const id = toAmazonListId("TESTLISTID");
    expect(id).toBe("TESTLISTID");
  });

  it("accepts lowercase letters", () => {
    expect(() => toAmazonListId("listid123")).not.toThrow();
  });

  it("throws for an empty string", () => {
    expect(() => toAmazonListId("")).toThrow("Invalid AmazonListId");
  });

  it("throws for a string containing non-alphanumeric characters", () => {
    expect(() => toAmazonListId("LIST-ID")).toThrow("Invalid AmazonListId");
  });
});

describe("toAsin", () => {
  it("returns an Asin for a valid 10-char uppercase alphanumeric string", () => {
    const asin = toAsin("B000000001");
    expect(asin).toBe("B000000001");
  });

  it("throws for a string shorter than 10 characters", () => {
    expect(() => toAsin("B00000001")).toThrow("Invalid Asin");
  });

  it("throws for a string longer than 10 characters", () => {
    expect(() => toAsin("B00000001X1")).toThrow("Invalid Asin");
  });

  it("throws for an empty string", () => {
    expect(() => toAsin("")).toThrow("Invalid Asin");
  });

  it("throws for a string containing lowercase letters", () => {
    expect(() => toAsin("b000000001")).toThrow("Invalid Asin");
  });

  it("throws for a string containing special characters", () => {
    expect(() => toAsin("B0000-0001")).toThrow("Invalid Asin");
  });
});

describe("buildAmazonWishlistUrl", () => {
  it("returns a /hz/wishlist/ls/ URL for a given list ID", () => {
    const id = toAmazonListId("TESTLISTID");
    expect(buildAmazonWishlistUrl(id)).toBe("https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID");
  });
});

describe("extractWishlistId", () => {
  it("extracts list ID from /hz/wishlist/ls/ URL", () => {
    expect(extractWishlistId("https://www.amazon.co.jp/hz/wishlist/ls/TESTLISTID")).toBe(
      "TESTLISTID",
    );
  });

  it("extracts list ID from /wishlist/ls/ URL (backward compat)", () => {
    expect(extractWishlistId("https://www.amazon.co.jp/wishlist/ls/TESTLISTID")).toBe("TESTLISTID");
  });

  it("returns null for a URL with no wishlist path", () => {
    expect(extractWishlistId("https://www.amazon.co.jp/dp/B000000001")).toBeNull();
  });
});
