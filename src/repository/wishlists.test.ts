import { describe, expect, it, vi } from "vitest";
import type { D1Client } from "../d1/client.js";
import { DEFAULT_THRESHOLD } from "../judge.js";
import { fetchEnabledWishlists } from "./wishlists.js";

function fakeClient(
  rows: unknown[],
): D1Client & { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn().mockResolvedValue(rows) };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "メイン",
  url: "https://www.amazon.co.jp/hz/wishlist/ls/AAA",
  threshold: null,
  ...overrides,
});

describe("fetchEnabledWishlists", () => {
  it("enabled = 1 の行だけを問い合わせる", async () => {
    const client = fakeClient([]);

    await fetchEnabledWishlists(client);

    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/enabled\s*=\s*1/);
    expect(sql).toMatch(/FROM wishlists/);
  });

  it("threshold が null の行には既定値を埋める", async () => {
    const client = fakeClient([row({ threshold: null })]);

    const wishlists = await fetchEnabledWishlists(client);

    expect(wishlists).toEqual([
      {
        id: 1,
        name: "メイン",
        url: "https://www.amazon.co.jp/hz/wishlist/ls/AAA",
        threshold: DEFAULT_THRESHOLD,
      },
    ]);
  });

  it("threshold が設定されている行はその値を使う", async () => {
    const client = fakeClient([row({ threshold: 0.5 })]);

    const wishlists = await fetchEnabledWishlists(client);

    expect(wishlists[0].threshold).toBe(0.5);
  });

  it("複数行をそのままの並びで返す", async () => {
    const client = fakeClient([
      row({ id: 1, name: "メイン", url: "https://example.com/a" }),
      row({
        id: 2,
        name: "技術書",
        url: "https://example.com/b",
        threshold: 0.4,
      }),
    ]);

    const wishlists = await fetchEnabledWishlists(client);

    expect(wishlists.map((w) => w.name)).toEqual(["メイン", "技術書"]);
    expect(wishlists.map((w) => w.threshold)).toEqual([DEFAULT_THRESHOLD, 0.4]);
  });

  it("1件もなければ空配列を返す", async () => {
    const client = fakeClient([]);

    await expect(fetchEnabledWishlists(client)).resolves.toEqual([]);
  });
});
