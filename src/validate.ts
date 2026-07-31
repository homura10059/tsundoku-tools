import type { WishlistItem } from "./types.js";

// P_kindle は一覧ページから全件取得できて当然なので、閾値未満なら一覧ページの
// 抽出ロジック自体が壊れている可能性が高い（過去に全角円記号を検知できず
// 全滅した実績があるため）。
const KINDLE_PRICE_MIN_RATE = 0.5;

// P_base は紙版が存在しない商品では null が正常なので、率での判定はしない。
// 「1件も取れていない」ことだけを、統計的に意味のある件数がある場合に検知する。
const REFERENCE_PRICE_MIN_ITEMS_FOR_CHECK = 5;

export type ValidationError =
  | { type: "MISSING_REQUIRED_FIELDS"; items: WishlistItem[] }
  | { type: "ALL_PRICES_MISSING" }
  | {
      type: "PRICE_EXTRACTION_DEGRADED";
      foundCount: number;
      totalCount: number;
    }
  | { type: "REFERENCE_PRICE_EXTRACTION_DEGRADED"; totalCount: number };

export function validate(items: WishlistItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const missingFieldItems = items.filter(
    (item) => item.title === "" || item.url === "",
  );
  if (missingFieldItems.length > 0) {
    errors.push({ type: "MISSING_REQUIRED_FIELDS", items: missingFieldItems });
  }

  const allPricesMissing =
    items.length > 0 &&
    items.every((item) => item.P_base === null && item.P_kindle === null);

  if (allPricesMissing) {
    errors.push({ type: "ALL_PRICES_MISSING" });
  } else if (items.length > 0) {
    const kindleFoundCount = items.filter(
      (item) => item.P_kindle !== null,
    ).length;
    if (kindleFoundCount / items.length < KINDLE_PRICE_MIN_RATE) {
      errors.push({
        type: "PRICE_EXTRACTION_DEGRADED",
        foundCount: kindleFoundCount,
        totalCount: items.length,
      });
    }

    if (items.length >= REFERENCE_PRICE_MIN_ITEMS_FOR_CHECK) {
      const baseFoundCount = items.filter(
        (item) => item.P_base !== null,
      ).length;
      if (baseFoundCount === 0) {
        errors.push({
          type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
          totalCount: items.length,
        });
      }
    }
  }

  return errors;
}
