import { render, screen } from "@testing-library/react";
import type { PriceSnapshot } from "@tsundoku-tools/shared";
import { describe, expect, it } from "vitest";
import { PriceHistoryChart } from "./PriceHistoryChart.js";

const snapshots: PriceSnapshot[] = [
  {
    id: "snap-1",
    asin: "B0000001",
    scrapedAt: "2024-01-01T00:00:00Z",
    priceJpy: 1000,
    listPriceJpy: 1200,
    discountRatePct: 16.67,
    points: 50,
    pointRatePct: 5,
    isPrime: true,
    inStock: true,
    seller: null,
    couponPct: null,
    couponJpy: null,
  },
  {
    id: "snap-2",
    asin: "B0000001",
    scrapedAt: "2024-01-15T00:00:00Z",
    priceJpy: 900,
    listPriceJpy: 1200,
    discountRatePct: 25,
    points: 45,
    pointRatePct: 5,
    isPrime: true,
    inStock: true,
    seller: null,
    couponPct: null,
    couponJpy: null,
  },
];

describe("PriceHistoryChart", () => {
  it("renders the chart heading", () => {
    render(<PriceHistoryChart snapshots={snapshots} />);
    expect(screen.getByText("価格履歴")).toBeInTheDocument();
  });

  it("renders without crashing with empty snapshots", () => {
    render(<PriceHistoryChart snapshots={[]} />);
    expect(screen.getByText("価格履歴")).toBeInTheDocument();
  });
});
