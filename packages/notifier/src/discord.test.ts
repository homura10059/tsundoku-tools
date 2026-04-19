import type { PriceAlert } from "@tsundoku-tools/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDiscordAlert } from "./discord.js";

const WEBHOOK_URL = "https://discord.example.com/webhook";

function makeAlert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    asin: "B000123456",
    title: "Test Product",
    productUrl: "https://www.amazon.co.jp/dp/B000123456",
    type: "price_drop",
    oldValue: 1000,
    newValue: 900,
    changePct: -10,
    ...overrides,
  };
}

describe("sendDiscordAlert", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe("HTTP request", () => {
    it("sends a POST to the webhook URL with JSON content-type", async () => {
      await sendDiscordAlert(WEBHOOK_URL, makeAlert());
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(WEBHOOK_URL);
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("throws when webhook responds with non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      });
      await expect(sendDiscordAlert(WEBHOOK_URL, makeAlert())).rejects.toThrow(
        "Discord webhook failed 400: Bad Request",
      );
    });
  });

  describe("embed structure", () => {
    function getEmbed(): Record<string, unknown> {
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        embeds: Record<string, unknown>[];
      };
      return body.embeds[0];
    }

    it("sets correct title combining label and product name", async () => {
      await sendDiscordAlert(WEBHOOK_URL, makeAlert({ type: "price_drop", title: "My Book" }));
      expect(getEmbed().title).toBe("価格下落: My Book");
    });

    it("sets product URL on the embed", async () => {
      await sendDiscordAlert(WEBHOOK_URL, makeAlert());
      expect(getEmbed().url).toBe("https://www.amazon.co.jp/dp/B000123456");
    });

    it("includes an ISO timestamp", async () => {
      await sendDiscordAlert(WEBHOOK_URL, makeAlert());
      const ts = getEmbed().timestamp as string;
      expect(ts).toBeDefined();
      expect(Number.isNaN(new Date(ts).getTime())).toBe(false);
    });
  });

  describe("embed colors", () => {
    it.each([
      ["price_drop" as const, 0x00c851],
      ["price_rise" as const, 0xff4444],
      ["new_discount" as const, 0x00c851],
      ["point_change" as const, 0x33b5e5],
      ["back_in_stock" as const, 0xffbb33],
      ["out_of_stock" as const, 0x9e9e9e],
    ])("uses correct color for %s", async (type, expectedColor) => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type, oldValue: null, newValue: null, changePct: null }),
      );
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const embed = (JSON.parse(options.body as string) as { embeds: { color: number }[] })
        .embeds[0];
      expect(embed.color).toBe(expectedColor);
    });
  });

  describe("embed fields", () => {
    function getFields(): { name: string; value: string; inline: boolean }[] {
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        embeds: { fields: { name: string; value: string; inline: boolean }[] }[];
      };
      return body.embeds[0].fields;
    }

    it("formats price fields with ¥ for price_drop", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "price_drop", oldValue: 1000, newValue: 900, changePct: -10 }),
      );
      const fields = getFields();
      expect(fields[0]).toEqual({ name: "変更前", value: "¥1,000", inline: true });
      expect(fields[1]).toEqual({ name: "変更後", value: "¥900", inline: true });
      expect(fields[2]).toEqual({ name: "変化率", value: "-10.0%", inline: true });
    });

    it("formats point fields with pt suffix for point_change", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "point_change", oldValue: 50, newValue: 150, changePct: 200 }),
      );
      const fields = getFields();
      expect(fields[0]).toEqual({ name: "変更前", value: "50pt", inline: true });
      expect(fields[1]).toEqual({ name: "変更後", value: "150pt", inline: true });
      expect(fields[2]).toEqual({ name: "変化率", value: "+200.0%", inline: true });
    });

    it("prefixes positive changePct with + sign", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "price_rise", oldValue: 1000, newValue: 1100, changePct: 10 }),
      );
      const fields = getFields();
      const ratioField = fields.find((f) => f.name === "変化率");
      expect(ratioField?.value).toBe("+10.0%");
    });

    it("omits fields when oldValue and newValue are null", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "out_of_stock", oldValue: null, newValue: null, changePct: null }),
      );
      expect(getFields()).toEqual([]);
    });

    it("omits changePct field when changePct is null", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "point_change", oldValue: 0, newValue: 100, changePct: null }),
      );
      const fields = getFields();
      expect(fields.find((f) => f.name === "変化率")).toBeUndefined();
      expect(fields).toHaveLength(2);
    });

    it("formats new_discount with list price as 変更前 and sale price as 変更後", async () => {
      await sendDiscordAlert(
        WEBHOOK_URL,
        makeAlert({ type: "new_discount", oldValue: 1200, newValue: 1000, changePct: 16.67 }),
      );
      const fields = getFields();
      expect(fields[0]).toEqual({ name: "変更前", value: "¥1,200", inline: true });
      expect(fields[1]).toEqual({ name: "変更後", value: "¥1,000", inline: true });
    });
  });
});
