import type { WishlistItem } from "./types.js";

export type ValidationError =
  | { type: "MISSING_REQUIRED_FIELDS"; items: WishlistItem[] }
  | { type: "ALL_PRICES_MISSING" };

export function validate(items: WishlistItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const missingFieldItems = items.filter(
    (item) => item.title === "" || item.url === "",
  );
  if (missingFieldItems.length > 0) {
    errors.push({ type: "MISSING_REQUIRED_FIELDS", items: missingFieldItems });
  }

  if (
    items.length > 0 &&
    items.every((item) => item.P_base === null && item.P_kindle === null)
  ) {
    errors.push({ type: "ALL_PRICES_MISSING" });
  }

  return errors;
}
