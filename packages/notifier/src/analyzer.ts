import type { PriceAlert, PriceSnapshot } from "@tsundoku-tools/shared";

export type AlertThresholds = {
  minPriceDropPct: number;
  minPointChange: number;
  cooldownHours: number;
};

export type RecentNotification = {
  notificationType: string;
  sentAt: string;
};

export function analyzeProduct(
  asin: string,
  title: string,
  productUrl: string,
  snapshots: Pick<
    PriceSnapshot,
    "priceJpy" | "listPriceJpy" | "points" | "inStock" | "scrapedAt"
  >[],
  recentNotifications: RecentNotification[],
  thresholds: AlertThresholds,
): PriceAlert[] {
  if (snapshots.length < 2) return [];

  const [current, previous] = snapshots;
  const alerts: PriceAlert[] = [];
  const now = Date.now();

  function hasCooldown(type: string): boolean {
    return recentNotifications.some((n) => {
      if (n.notificationType !== type) return false;
      const sentMs = new Date(n.sentAt).getTime();
      return now - sentMs < thresholds.cooldownHours * 3600 * 1000;
    });
  }

  // Stock change alerts
  if (!current.inStock && previous.inStock && !hasCooldown("out_of_stock")) {
    alerts.push({ asin, title, productUrl, type: "out_of_stock", oldValue: null, newValue: null, changePct: null });
  }
  if (current.inStock && !previous.inStock && !hasCooldown("back_in_stock")) {
    alerts.push({ asin, title, productUrl, type: "back_in_stock", oldValue: null, newValue: null, changePct: null });
  }

  // Price alerts
  if (current.priceJpy !== null && previous.priceJpy !== null) {
    const changePct =
      ((current.priceJpy - previous.priceJpy) / previous.priceJpy) * 100;

    if (changePct <= -thresholds.minPriceDropPct && !hasCooldown("price_drop")) {
      alerts.push({
        asin,
        title,
        productUrl,
        type: "price_drop",
        oldValue: previous.priceJpy,
        newValue: current.priceJpy,
        changePct,
      });
    } else if (changePct > 0 && !hasCooldown("price_rise")) {
      alerts.push({
        asin,
        title,
        productUrl,
        type: "price_rise",
        oldValue: previous.priceJpy,
        newValue: current.priceJpy,
        changePct,
      });
    }
  }

  // New discount detected
  if (
    current.listPriceJpy !== null &&
    current.priceJpy !== null &&
    previous.listPriceJpy === null &&
    !hasCooldown("new_discount")
  ) {
    alerts.push({
      asin,
      title,
      productUrl,
      type: "new_discount",
      oldValue: current.listPriceJpy,
      newValue: current.priceJpy,
      changePct: ((current.listPriceJpy - current.priceJpy) / current.listPriceJpy) * 100,
    });
  }

  // Point change alerts
  if (current.points !== null && previous.points !== null) {
    const pointDelta = current.points - previous.points;
    if (Math.abs(pointDelta) >= thresholds.minPointChange && !hasCooldown("point_change")) {
      alerts.push({
        asin,
        title,
        productUrl,
        type: "point_change",
        oldValue: previous.points,
        newValue: current.points,
        changePct: previous.points > 0 ? (pointDelta / previous.points) * 100 : null,
      });
    }
  }

  return alerts;
}
