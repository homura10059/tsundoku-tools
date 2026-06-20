import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "./types.js";

vi.mock("./util/jitter.js", () => ({
  jitter: vi.fn().mockResolvedValue(undefined),
}));

import { notify } from "./notify.js";
import { jitter } from "./util/jitter.js";

const WEBHOOK = "https://discord.example.com/webhook";

function makeDeal(n: number): Deal {
  return {
    title: `Book ${n}`,
    url: `https://example.com/${n}`,
    format: "Kindle",
    P_base: 1000,
    P_kindle: 700,
    Pt: 0,
    discountRate: 0.3,
    pointRate: 0,
  };
}

function makeDeals(count: number): Deal[] {
  return Array.from({ length: count }, (_, i) => makeDeal(i + 1));
}

describe("notify", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.mocked(jitter).mockClear();
  });

  it("0件のとき fetch も jitter も呼ばれない", async () => {
    await notify([], WEBHOOK);
    expect(fetch).not.toHaveBeenCalled();
    expect(jitter).not.toHaveBeenCalled();
  });

  it("1件のとき fetch が1回、jitter が0回", async () => {
    await notify(makeDeals(1), WEBHOOK);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jitter).not.toHaveBeenCalled();
  });

  it("5件のとき fetch が1回（1チャンク）、jitter が0回", async () => {
    await notify(makeDeals(5), WEBHOOK);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jitter).not.toHaveBeenCalled();
  });

  it("6件のとき fetch が2回（5+1チャンク）、jitter が1回", async () => {
    await notify(makeDeals(6), WEBHOOK);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(jitter).toHaveBeenCalledTimes(1);
  });

  it("11件のとき fetch が3回（5+5+1チャンク）、jitter が2回", async () => {
    await notify(makeDeals(11), WEBHOOK);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(jitter).toHaveBeenCalledTimes(2);
  });

  it("11件のとき各チャンクの embeds 数が 5/5/1", async () => {
    await notify(makeDeals(11), WEBHOOK);
    const calls = vi.mocked(fetch).mock.calls;
    const body0 = JSON.parse(calls[0][1]?.body as string);
    const body1 = JSON.parse(calls[1][1]?.body as string);
    const body2 = JSON.parse(calls[2][1]?.body as string);
    expect(body0.embeds).toHaveLength(5);
    expect(body1.embeds).toHaveLength(5);
    expect(body2.embeds).toHaveLength(1);
  });

  it("jitter を最低2秒で呼ぶ", async () => {
    await notify(makeDeals(6), WEBHOOK);
    expect(jitter).toHaveBeenCalledWith(2_000, 3_000);
  });

  it("fetch 失敗時にエラーログを出し例外を投げない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      }),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notify(makeDeals(1), WEBHOOK)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
