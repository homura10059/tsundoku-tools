import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debug } from "./logger.js";

describe("debug", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset a key
    delete process.env.DEBUG;
  });

  it("DEBUG 未設定のとき console.debug を呼ばない", () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset a key
    delete process.env.DEBUG;
    debug("hello");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("DEBUG=true のとき [debug] プレフィックス付きで console.debug を呼ぶ", () => {
    process.env.DEBUG = "true";
    debug("hello", 42);
    expect(consoleSpy).toHaveBeenCalledWith("[debug]", "hello", 42);
  });

  it('DEBUG="" (空文字) のとき console.debug を呼ばない', () => {
    process.env.DEBUG = "";
    debug("hello");
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
