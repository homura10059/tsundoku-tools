import { describe, expect, it } from "vitest";
import { analyzeProduct } from "./analyzer.js";
import type { AlertThresholds, RecentNotification } from "./analyzer.js";

const defaultThresholds: AlertThresholds = {
  minPriceDropPct: 5,
  minPointChange: 50,
  cooldownHours: 6,
};

type SnapshotInput = Parameters<typeof analyzeProduct>[3][number];

function makeSnapshot(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    priceJpy: 1000,
    listPriceJpy: null,
    points: null,
    inStock: true,
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNotification(type: string, hoursAgo: number): RecentNotification {
  return {
    notificationType: type,
    sentAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
  };
}

const asin = "B000123456";
const title = "Test Product";
const productUrl = "https://www.amazon.co.jp/dp/B000123456";

describe("analyzeProduct", () => {
  describe("insufficient snapshots", () => {
    it("returns empty array when given 0 snapshots", () => {
      expect(analyzeProduct(asin, title, productUrl, [], [], defaultThresholds)).toEqual([]);
    });

    it("returns empty array when given only 1 snapshot", () => {
      expect(
        analyzeProduct(asin, title, productUrl, [makeSnapshot()], [], defaultThresholds),
      ).toEqual([]);
    });
  });

  describe("stock changes", () => {
    it("generates out_of_stock when inStock goes from true to false", () => {
      const snapshots = [makeSnapshot({ inStock: false }), makeSnapshot({ inStock: true })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "out_of_stock");
      expect(alert).toBeDefined();
      expect(alert?.oldValue).toBeNull();
      expect(alert?.newValue).toBeNull();
      expect(alert?.changePct).toBeNull();
    });

    it("generates back_in_stock when inStock goes from false to true", () => {
      const snapshots = [makeSnapshot({ inStock: true }), makeSnapshot({ inStock: false })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "back_in_stock")).toBeDefined();
    });

    it("does not generate stock alert when inStock is unchanged", () => {
      const snapshots = [makeSnapshot({ inStock: true }), makeSnapshot({ inStock: true })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "out_of_stock")).toBeUndefined();
      expect(alerts.find((a) => a.type === "back_in_stock")).toBeUndefined();
    });
  });

  describe("price_drop", () => {
    it("generates alert when price falls by at least the threshold", () => {
      const snapshots = [makeSnapshot({ priceJpy: 900 }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "price_drop");
      expect(alert).toBeDefined();
      expect(alert?.oldValue).toBe(1000);
      expect(alert?.newValue).toBe(900);
      expect(alert?.changePct).toBeCloseTo(-10);
    });

    it("generates alert when drop equals exactly the threshold", () => {
      const snapshots = [makeSnapshot({ priceJpy: 950 }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "price_drop")).toBeDefined();
    });

    it("does not generate alert when drop is below threshold", () => {
      const snapshots = [makeSnapshot({ priceJpy: 970 }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "price_drop")).toBeUndefined();
    });

    it("does not generate alert when either price is null", () => {
      const snapshots = [makeSnapshot({ priceJpy: null }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "price_drop")).toBeUndefined();
    });
  });

  describe("price_rise", () => {
    it("generates alert when price increases", () => {
      const snapshots = [makeSnapshot({ priceJpy: 1100 }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "price_rise");
      expect(alert).toBeDefined();
      expect(alert?.oldValue).toBe(1000);
      expect(alert?.newValue).toBe(1100);
      expect(alert?.changePct).toBeCloseTo(10);
    });

    it("does not generate alert when price is unchanged", () => {
      const snapshots = [makeSnapshot({ priceJpy: 1000 }), makeSnapshot({ priceJpy: 1000 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "price_rise")).toBeUndefined();
    });
  });

  describe("new_discount", () => {
    it("generates alert when listPriceJpy appears for the first time", () => {
      const snapshots = [
        makeSnapshot({ priceJpy: 1000, listPriceJpy: 1200 }),
        makeSnapshot({ priceJpy: 1000, listPriceJpy: null }),
      ];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "new_discount");
      expect(alert).toBeDefined();
      expect(alert?.oldValue).toBe(1200);
      expect(alert?.newValue).toBe(1000);
      expect(alert?.changePct).toBeCloseTo(16.67);
    });

    it("does not generate alert when previous also had listPriceJpy", () => {
      const snapshots = [
        makeSnapshot({ priceJpy: 1000, listPriceJpy: 1200 }),
        makeSnapshot({ priceJpy: 1000, listPriceJpy: 1300 }),
      ];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "new_discount")).toBeUndefined();
    });

    it("does not generate alert when current has no priceJpy", () => {
      const snapshots = [
        makeSnapshot({ priceJpy: null, listPriceJpy: 1200 }),
        makeSnapshot({ priceJpy: 1000, listPriceJpy: null }),
      ];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "new_discount")).toBeUndefined();
    });
  });

  describe("point_change", () => {
    it("generates alert when point increase meets threshold", () => {
      const snapshots = [makeSnapshot({ points: 150 }), makeSnapshot({ points: 50 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "point_change");
      expect(alert).toBeDefined();
      expect(alert?.oldValue).toBe(50);
      expect(alert?.newValue).toBe(150);
      expect(alert?.changePct).toBeCloseTo(200);
    });

    it("generates alert when point decrease meets threshold", () => {
      const snapshots = [makeSnapshot({ points: 0 }), makeSnapshot({ points: 100 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "point_change")).toBeDefined();
    });

    it("does not generate alert when delta is below threshold", () => {
      const snapshots = [makeSnapshot({ points: 80 }), makeSnapshot({ points: 50 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "point_change")).toBeUndefined();
    });

    it("does not generate alert when either value is null", () => {
      const snapshots = [makeSnapshot({ points: null }), makeSnapshot({ points: 50 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "point_change")).toBeUndefined();
    });

    it("sets changePct to null when previous points is 0", () => {
      const snapshots = [makeSnapshot({ points: 100 }), makeSnapshot({ points: 0 })];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      const alert = alerts.find((a) => a.type === "point_change");
      expect(alert).toBeDefined();
      expect(alert?.changePct).toBeNull();
    });
  });

  describe("cooldown", () => {
    it("skips alert when same type was sent within cooldown window", () => {
      const snapshots = [makeSnapshot({ inStock: false }), makeSnapshot({ inStock: true })];
      const recentNotifs = [makeNotification("out_of_stock", 3)];
      const alerts = analyzeProduct(
        asin,
        title,
        productUrl,
        snapshots,
        recentNotifs,
        defaultThresholds,
      );
      expect(alerts.find((a) => a.type === "out_of_stock")).toBeUndefined();
    });

    it("sends alert when cooldown has expired", () => {
      const snapshots = [makeSnapshot({ inStock: false }), makeSnapshot({ inStock: true })];
      const recentNotifs = [makeNotification("out_of_stock", 7)];
      const alerts = analyzeProduct(
        asin,
        title,
        productUrl,
        snapshots,
        recentNotifs,
        defaultThresholds,
      );
      expect(alerts.find((a) => a.type === "out_of_stock")).toBeDefined();
    });

    it("cooldown for one type does not suppress different types", () => {
      const snapshots = [
        makeSnapshot({ inStock: false, priceJpy: 900 }),
        makeSnapshot({ inStock: true, priceJpy: 1000 }),
      ];
      const recentNotifs = [makeNotification("out_of_stock", 1)];
      const alerts = analyzeProduct(
        asin,
        title,
        productUrl,
        snapshots,
        recentNotifs,
        defaultThresholds,
      );
      expect(alerts.find((a) => a.type === "out_of_stock")).toBeUndefined();
      expect(alerts.find((a) => a.type === "price_drop")).toBeDefined();
    });
  });

  describe("alert metadata", () => {
    it("includes asin, title, and productUrl in every alert", () => {
      const snapshots = [makeSnapshot({ inStock: false }), makeSnapshot({ inStock: true })];
      const [alert] = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alert.asin).toBe(asin);
      expect(alert.title).toBe(title);
      expect(alert.productUrl).toBe(productUrl);
    });

    it("can return multiple alerts when multiple conditions are met simultaneously", () => {
      const snapshots = [
        makeSnapshot({ priceJpy: 900, inStock: true }),
        makeSnapshot({ priceJpy: 1000, inStock: false }),
      ];
      const alerts = analyzeProduct(asin, title, productUrl, snapshots, [], defaultThresholds);
      expect(alerts.find((a) => a.type === "back_in_stock")).toBeDefined();
      expect(alerts.find((a) => a.type === "price_drop")).toBeDefined();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
