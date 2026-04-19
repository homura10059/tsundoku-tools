import { render, screen, waitFor } from "@testing-library/react";
import type { PriceSnapshot, Product } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  api: {
    products: {
      get: vi.fn(),
      snapshots: vi.fn(),
    },
  },
}));

import { api } from "../lib/api.js";
import ProductDetail from "./ProductDetail.js";

const product: Product = {
  asin: "B0000001",
  title: "テスト書籍",
  url: "https://www.amazon.co.jp/dp/B0000001",
  imageUrl: "https://example.com/img.jpg",
  category: "本",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const snapshot: PriceSnapshot = {
  id: "snap-1",
  asin: "B0000001",
  scrapedAt: "2024-01-15T00:00:00Z",
  priceJpy: 1500,
  listPriceJpy: 2000,
  discountRatePct: 25,
  points: 75,
  pointRatePct: 5,
  isPrime: true,
  inStock: true,
  seller: null,
  couponPct: null,
  couponJpy: null,
};

function setSearch(search: string) {
  window.history.replaceState({}, "", `/products${search}`);
}

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/products");
});

describe("ProductDetail", () => {
  it("shows 'ASIN が指定されていません' when no asin in URL", () => {
    render(<ProductDetail />);
    expect(screen.getByText("ASIN が指定されていません。")).toBeInTheDocument();
  });

  it("shows loading state initially when asin is present", () => {
    setSearch("?asin=B0000001");
    vi.mocked(api.products.get).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.products.snapshots).mockReturnValue(new Promise(() => {}));
    render(<ProductDetail />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("renders product title and stats after loading", async () => {
    setSearch("?asin=B0000001");
    vi.mocked(api.products.get).mockResolvedValue(product);
    vi.mocked(api.products.snapshots).mockResolvedValue([snapshot]);
    render(<ProductDetail />);

    await waitFor(() => {
      expect(screen.getByText("テスト書籍")).toBeInTheDocument();
      expect(screen.getByText("¥1,500")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("75pt")).toBeInTheDocument();
    });
  });

  it("shows error when API fails", async () => {
    setSearch("?asin=B0000001");
    vi.mocked(api.products.get).mockRejectedValue(new Error("Not found"));
    vi.mocked(api.products.snapshots).mockRejectedValue(new Error("Not found"));
    render(<ProductDetail />);

    await waitFor(() => {
      expect(screen.getByText(/エラー:/)).toBeInTheDocument();
    });
  });

  it("shows 'Amazon で見る' link", async () => {
    setSearch("?asin=B0000001");
    vi.mocked(api.products.get).mockResolvedValue(product);
    vi.mocked(api.products.snapshots).mockResolvedValue([snapshot]);
    render(<ProductDetail />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "Amazon で見る →" });
      expect(link).toHaveAttribute("href", product.url);
    });
  });
});
