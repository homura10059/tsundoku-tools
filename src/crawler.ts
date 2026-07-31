import { chromium } from "playwright";
import type { Page } from "playwright";
import type { Format, WishlistItem } from "./types.js";
import { jitter } from "./util/jitter.js";
import { debug } from "./util/logger.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SELECTORS = {
  itemList: "#g-items",
  itemRow: "li[data-id]",
  titleLink: "a[id^='itemName_']",
  byline: "span[id^='item-byline-']",
  priceArea: "[id^='itemPrice_']",
} as const;

export interface RawItem {
  title: string;
  url: string;
  bylineText: string;
  priceTexts: string[];
  pointsText: string;
}

interface Diagnostics {
  rowCount: number;
  priceAreaFoundCount: number;
  selectorHitCounts: {
    aPrice: number;
    aOffscreen: number;
    aPriceWhole: number;
    aTextStrike: number;
  };
  sampleSpans: string[][];
}

function describeYenCodepoints(text: string): string[] {
  return Array.from(text)
    .filter((ch) => ch === "¥" || ch === "￥")
    .map(
      (ch) =>
        `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`,
    );
}

function logDiagnostics(diagnostics: Diagnostics): void {
  debug(
    `[diag] rowCount=${diagnostics.rowCount} priceAreaFoundCount=${diagnostics.priceAreaFoundCount}`,
  );
  debug(
    `[diag] selectorHitCounts=${JSON.stringify(diagnostics.selectorHitCounts)}`,
  );
  diagnostics.sampleSpans.forEach((spans, i) => {
    const codepoints = spans.flatMap(describeYenCodepoints);
    debug(
      `[diag] row${i} spans=${JSON.stringify(spans)} yenCodepoints=${JSON.stringify(codepoints)}`,
    );
  });
}

export function parsePrice(priceTexts: string[]): {
  P_base: number | null;
  P_kindle: number | null;
} {
  const prices = priceTexts
    .map((t) => Number.parseInt(t.replace(/[¥,]/g, ""), 10))
    .filter((n) => !Number.isNaN(n));

  if (prices.length === 0) return { P_base: null, P_kindle: null };
  if (prices.length === 1) return { P_base: null, P_kindle: prices[0] };

  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return { P_base: max, P_kindle: min };
}

export function parsePoints(pointsText: string): number {
  const match = pointsText.match(/(\d+)\s*(?:pt|ポイント)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function parseFormat(bylineText: string): Format {
  if (bylineText.includes("Kindle")) return "Kindle";
  if (
    bylineText.includes("単行本") ||
    bylineText.includes("文庫") ||
    bylineText.includes("ハードカバー") ||
    bylineText.includes("新書") ||
    bylineText.includes("コミック")
  ) {
    return "紙";
  }
  return "その他";
}

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

export const SCROLL_MAX_ITERATIONS = 20;

export async function scrollToLoadAll(
  page: Page,
  waitFn: () => Promise<void> = jitter,
): Promise<void> {
  let prevCount = 0;
  let stableRounds = 0;

  for (let i = 0; i < SCROLL_MAX_ITERATIONS; i++) {
    const currentCount = await page.evaluate(
      (sel) =>
        document.querySelectorAll(`${sel.itemList} ${sel.itemRow}`).length,
      SELECTORS,
    );

    if (currentCount === prevCount) {
      stableRounds++;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    prevCount = currentCount;

    await page.keyboard.press("End");
    await waitFn();
  }
}

interface DetailPageDiagnostics {
  selectorHits: Record<string, number>;
  labelHits: Record<string, number>;
  swatchIds: string[];
  nonKindleSwatchHtml: string | null;
}

const DETAIL_DIAG_SELECTORS = [
  "#tmmSwatches",
  "#tmm-grid-swatch-KINDLE",
  ".a-price",
  ".a-text-strike",
  "#formats",
] as const;

const DETAIL_DIAG_LABELS = ["単行本", "文庫", "参考価格", "定価"] as const;

async function diagnoseDetailPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await jitter();

  const diagnostics = await page.evaluate<
    DetailPageDiagnostics,
    { selectors: readonly string[]; labels: readonly string[] }
  >(
    ({ selectors, labels }) => {
      const selectorHits: Record<string, number> = {};
      for (const sel of selectors) {
        selectorHits[sel] = document.querySelectorAll(sel).length;
      }

      const labelHits: Record<string, number> = {};
      for (const label of labels) {
        labelHits[label] = Array.from(
          document.querySelectorAll("body *"),
        ).filter(
          (el) =>
            el.children.length === 0 && (el.textContent ?? "").includes(label),
        ).length;
      }

      const swatchEls = Array.from(
        document.querySelectorAll('[id^="tmm-grid-swatch-"]'),
      );
      const swatchIds = swatchEls.map((el) => el.id);
      const nonKindleSwatch = swatchEls.find(
        (el) => el.id !== "tmm-grid-swatch-KINDLE",
      );
      const nonKindleSwatchHtml =
        nonKindleSwatch?.outerHTML?.slice(0, 3000) ?? null;

      return { selectorHits, labelHits, swatchIds, nonKindleSwatchHtml };
    },
    { selectors: DETAIL_DIAG_SELECTORS, labels: DETAIL_DIAG_LABELS },
  );

  debug(
    `[diag-detail] selectorHits=${JSON.stringify(diagnostics.selectorHits)}`,
  );
  debug(`[diag-detail] labelHits=${JSON.stringify(diagnostics.labelHits)}`);
  debug(`[diag-detail] swatchIds=${JSON.stringify(diagnostics.swatchIds)}`);
  debug(
    `[diag-detail] nonKindleSwatchHtml=${diagnostics.nonKindleSwatchHtml ?? "(not found)"}`,
  );
}

export async function crawl(wishlistUrl: string): Promise<WishlistItem[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    await page.goto(wishlistUrl, { waitUntil: "domcontentloaded" });
    await jitter();
    await page.waitForSelector(SELECTORS.itemList, { timeout: 10_000 });
    await scrollToLoadAll(page);

    const { rawItems, diagnostics } = await page.evaluate<
      { rawItems: RawItem[]; diagnostics: Diagnostics },
      typeof SELECTORS
    >((selectors) => {
      const rows = Array.from(
        document.querySelectorAll(`${selectors.itemList} ${selectors.itemRow}`),
      );

      const items = rows.map((row) => {
        const titleEl = row.querySelector(selectors.titleLink);
        const bylineEl = row.querySelector(selectors.byline);
        const priceAreaEl = row.querySelector(selectors.priceArea);

        const priceTexts = Array.from(
          (priceAreaEl ?? row).querySelectorAll("span"),
        )
          .map((s) => s.textContent?.trim() ?? "")
          .filter((t) => /^¥[\d,]+$/.test(t));

        const pointSpans = Array.from(row.querySelectorAll("span"))
          .map((s) => s.textContent?.trim() ?? "")
          .filter((t) => t.includes("ポイント") || /\d+pt/.test(t));

        return {
          title: titleEl?.textContent?.trim() ?? "",
          url: titleEl?.getAttribute("href") ?? "",
          bylineText: bylineEl?.textContent?.trim() ?? "",
          priceTexts,
          pointsText: pointSpans[0] ?? "",
        };
      });

      const diagnostics = {
        rowCount: rows.length,
        priceAreaFoundCount: rows.filter((row) =>
          row.querySelector(selectors.priceArea),
        ).length,
        selectorHitCounts: {
          aPrice: document.querySelectorAll(".a-price").length,
          aOffscreen: document.querySelectorAll(".a-offscreen").length,
          aPriceWhole: document.querySelectorAll(".a-price-whole").length,
          aTextStrike: document.querySelectorAll(".a-text-strike").length,
        },
        sampleSpans: rows.slice(0, 3).map((row) => {
          const priceAreaEl = row.querySelector(selectors.priceArea);
          return Array.from((priceAreaEl ?? row).querySelectorAll("span"))
            .map((s) => s.textContent?.trim() ?? "")
            .filter((t) => /\d/.test(t));
        }),
      };

      return { rawItems: items, diagnostics };
    }, SELECTORS);

    logDiagnostics(diagnostics);

    const kindleItems = rawItems
      .filter((raw) => raw.title !== "")
      .map(parseSafeRawItem)
      .filter((item): item is WishlistItem => item !== null)
      .filter((item) => item.format === "Kindle");

    if (process.env.DEBUG) {
      for (const item of kindleItems.slice(0, 2)) {
        try {
          await diagnoseDetailPage(page, item.url);
        } catch (err) {
          debug(`[diag-detail] failed: ${err}`);
        }
      }
    }

    return kindleItems;
  } finally {
    await browser.close();
  }
}

export function parseSafeRawItem(raw: RawItem): WishlistItem | null {
  try {
    return parseRawItem(raw);
  } catch (err) {
    console.error("[crawler] Failed to parse item:", err);
    return null;
  }
}

export function parseRawItem(raw: RawItem): WishlistItem {
  const url = raw.url.startsWith("/")
    ? `${AMAZON_BASE_URL}${raw.url}`
    : raw.url;
  const { P_base, P_kindle } = parsePrice(raw.priceTexts);
  const Pt = parsePoints(raw.pointsText);
  debug(`${raw.title} | P_base=${P_base} P_kindle=${P_kindle} Pt=${Pt}`);
  return {
    title: raw.title,
    url,
    format: parseFormat(raw.bylineText),
    P_base,
    P_kindle,
    Pt,
  };
}
