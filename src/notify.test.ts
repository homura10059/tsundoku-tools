import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "./types.js";
import type { ValidationError } from "./validate.js";

vi.mock("./util/jitter.js", () => ({
  jitter: vi.fn().mockResolvedValue(undefined),
}));

import { notify, notifyError } from "./notify.js";
import { jitter } from "./util/jitter.js";

const WEBHOOK = "https://discord.example.com/webhook";
const WISHLIST = { name: "メイン", threshold: 0.2 };

function bodyOf(callIndex: number) {
  return JSON.parse(vi.mocked(fetch).mock.calls[callIndex][1]?.body as string);
}

function makeDeal(n: number): Deal {
  return {
    title: `Book ${n}`,
    url: `https://example.com/${n}`,
    format: "Kindle",
    P_base: 1000,
    P_kindle: 700,
    Pt: 0,
    hasPaperSwatch: true,
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
    await notify([], WEBHOOK, WISHLIST);
    expect(fetch).not.toHaveBeenCalled();
    expect(jitter).not.toHaveBeenCalled();
  });

  it("1件のとき fetch が1回、jitter が0回", async () => {
    await notify(makeDeals(1), WEBHOOK, WISHLIST);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jitter).not.toHaveBeenCalled();
  });

  it("5件のとき fetch が1回（1チャンク）、jitter が0回", async () => {
    await notify(makeDeals(5), WEBHOOK, WISHLIST);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jitter).not.toHaveBeenCalled();
  });

  it("6件のとき fetch が2回（5+1チャンク）、jitter が1回", async () => {
    await notify(makeDeals(6), WEBHOOK, WISHLIST);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(jitter).toHaveBeenCalledTimes(1);
  });

  it("11件のとき fetch が3回（5+5+1チャンク）、jitter が2回", async () => {
    await notify(makeDeals(11), WEBHOOK, WISHLIST);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(jitter).toHaveBeenCalledTimes(2);
  });

  it("11件のとき各チャンクの embeds 数が 5/5/1", async () => {
    await notify(makeDeals(11), WEBHOOK, WISHLIST);
    const calls = vi.mocked(fetch).mock.calls;
    const body0 = JSON.parse(calls[0][1]?.body as string);
    const body1 = JSON.parse(calls[1][1]?.body as string);
    const body2 = JSON.parse(calls[2][1]?.body as string);
    expect(body0.embeds).toHaveLength(5);
    expect(body1.embeds).toHaveLength(5);
    expect(body2.embeds).toHaveLength(1);
  });

  it("jitter を最低2秒で呼ぶ", async () => {
    await notify(makeDeals(6), WEBHOOK, WISHLIST);
    expect(jitter).toHaveBeenCalledWith(2_000, 3_000);
  });

  it("リスト名を content に載せる", async () => {
    await notify(makeDeals(1), WEBHOOK, WISHLIST);
    expect(bodyOf(0).content).toContain("メイン");
  });

  it("分割送信時は content にチャンクの連番を載せる", async () => {
    await notify(makeDeals(6), WEBHOOK, WISHLIST);
    expect(bodyOf(0).content).toContain("1/2");
    expect(bodyOf(1).content).toContain("2/2");
  });

  it("リストの閾値を超えた率だけを embed に表示する", async () => {
    // 割引率 30% はヒット、ポイント還元率 25% は閾値 30% 未満
    const deal = { ...makeDeal(1), discountRate: 0.3, pointRate: 0.25 };
    await notify([deal], WEBHOOK, { name: "厳しめ", threshold: 0.3 });

    const fields: { name: string }[] = bodyOf(0).embeds[0].fields;
    expect(fields.some((f) => f.name === "割引率")).toBe(true);
    expect(fields.some((f) => f.name === "ポイント還元率")).toBe(false);
  });

  it("閾値が既定より低いリストでも、超えた率が表示される", async () => {
    // 閾値 10%。割引率 15% は既定の 20% 未満だがこのリストではヒット扱い
    const deal = { ...makeDeal(1), discountRate: 0.15, pointRate: 0 };
    await notify([deal], WEBHOOK, { name: "ゆるめ", threshold: 0.1 });

    const fields: { name: string }[] = bodyOf(0).embeds[0].fields;
    expect(fields.some((f) => f.name === "割引率")).toBe(true);
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
    await expect(
      notify(makeDeals(1), WEBHOOK, WISHLIST),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("notifyError", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("エラーを fetch で1回送信する", async () => {
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("送信ボディに embeds が含まれる", async () => {
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.embeds).toHaveLength(1);
  });

  it("MISSING_REQUIRED_FIELDS のフィールドが embed に含まれる", async () => {
    const errors: ValidationError[] = [
      {
        type: "MISSING_REQUIRED_FIELDS",
        items: [
          {
            title: "",
            url: "https://example.com",
            format: "Kindle",
            P_base: null,
            P_kindle: null,
            Pt: 0,
            hasPaperSwatch: false,
          },
        ],
      },
    ];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const fields: { name: string }[] = body.embeds[0].fields;
    expect(fields.some((f) => f.name === "必須フィールド欠損")).toBe(true);
  });

  it("ALL_PRICES_MISSING のフィールドが embed に含まれる", async () => {
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const fields: { name: string }[] = body.embeds[0].fields;
    expect(fields.some((f) => f.name === "価格情報が全滅")).toBe(true);
  });

  it("PRICE_EXTRACTION_DEGRADED のフィールドが embed に含まれる", async () => {
    const errors: ValidationError[] = [
      { type: "PRICE_EXTRACTION_DEGRADED", foundCount: 2, totalCount: 10 },
    ];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const fields: { name: string; value: string }[] = body.embeds[0].fields;
    const field = fields.find((f) => f.name === "Kindle価格の取得率が低下");
    expect(field?.value).toContain("10件中 2件");
  });

  it("REFERENCE_PRICE_EXTRACTION_DEGRADED のフィールドが embed に含まれる", async () => {
    const errors: ValidationError[] = [
      {
        type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
        foundCount: 1,
        totalCount: 8,
      },
    ];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const fields: { name: string; value: string }[] = body.embeds[0].fields;
    const field = fields.find((f) => f.name === "紙版価格の取得率が低下");
    expect(field?.value).toContain("8件中 1件");
  });

  it("embed のタイトルにリスト名が含まれる", async () => {
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    expect(bodyOf(0).embeds[0].title).toContain("メイン");
  });

  it("embed の color が赤（0xff0000）", async () => {
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await notifyError(errors, WEBHOOK, WISHLIST.name);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.embeds[0].color).toBe(0xff0000);
  });

  it("fetch 失敗時にエラーログを出し例外を投げない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];
    await expect(
      notifyError(errors, WEBHOOK, WISHLIST.name),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
