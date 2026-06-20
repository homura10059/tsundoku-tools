import { afterEach, describe, expect, it, vi } from "vitest";
import { jitter } from "./jitter.js";

describe("jitter", () => {
  afterEach(() => vi.useRealTimers());

  it("ディレイが [minMs, maxMs] の範囲に収まる", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    const p = jitter(500, 1000);
    vi.runAllTimers();
    await p;
    const delay = spy.mock.calls[0][1] as number;
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("デフォルト引数が 1000〜3000ms", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    const p = jitter();
    vi.runAllTimers();
    await p;
    const delay = spy.mock.calls[0][1] as number;
    expect(delay).toBeGreaterThanOrEqual(1_000);
    expect(delay).toBeLessThanOrEqual(3_000);
  });

  it("Promise を返し resolve する", async () => {
    vi.useFakeTimers();
    const p = jitter(0, 0);
    vi.runAllTimers();
    await expect(p).resolves.toBeUndefined();
  });
});
