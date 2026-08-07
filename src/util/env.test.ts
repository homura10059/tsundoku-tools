import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUrlList, requireEnv, requireEnvList } from "./env.js";

describe("parseUrlList", () => {
  it("単一URLをそのまま配列で返す", () => {
    expect(parseUrlList("https://example.com/a")).toEqual([
      "https://example.com/a",
    ]);
  });

  it("カンマ区切りの複数URLを配列に分割する", () => {
    expect(parseUrlList("https://example.com/a,https://example.com/b")).toEqual(
      ["https://example.com/a", "https://example.com/b"],
    );
  });

  it("各URLの前後の空白を取り除く", () => {
    expect(
      parseUrlList(" https://example.com/a , https://example.com/b "),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("連続カンマ・末尾カンマで生まれる空要素を除去する", () => {
    expect(
      parseUrlList("https://example.com/a,,https://example.com/b,"),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("空文字列 → 空配列", () => {
    expect(parseUrlList("")).toEqual([]);
  });
});

describe("requireEnv / requireEnvList", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset a key
    delete process.env.TEST_ENV_VAR;
  });

  it("requireEnv: 値が設定されていればそのまま返す", () => {
    process.env.TEST_ENV_VAR = "value";
    expect(requireEnv("TEST_ENV_VAR")).toBe("value");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("requireEnv: 未設定なら process.exit(1) する", () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset a key
    delete process.env.TEST_ENV_VAR;
    requireEnv("TEST_ENV_VAR");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("requireEnvList: カンマ区切りを配列にして返す", () => {
    process.env.TEST_ENV_VAR = "https://example.com/a,https://example.com/b";
    expect(requireEnvList("TEST_ENV_VAR")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("requireEnvList: 空要素しかない場合は process.exit(1) する", () => {
    process.env.TEST_ENV_VAR = " , ,";
    requireEnvList("TEST_ENV_VAR");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
