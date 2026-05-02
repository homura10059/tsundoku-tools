import { render, screen, waitFor } from "@testing-library/react";
import type { Product } from "@tsundoku-tools/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  api: {
    wishlists: {
      products: vi.fn(),
    },
  },
}));

vi.mock("../lib/auth.js", () => ({
  getToken: vi.fn(),
}));

import { api } from "../lib/api.js";
import { getToken } from "../lib/auth.js";
import WishlistProducts from "./WishlistProducts.js";

const products: Product[] = [
  {
    asin: "B0000001",
    title: "テスト商品 A",
    url: "https://www.amazon.co.jp/dp/B0000001",
    imageUrl: "https://example.com/img/A.jpg",
    category: "本",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    asin: "B0000002",
    title: "テスト商品 B",
    url: "https://www.amazon.co.jp/dp/B0000002",
    imageUrl: null,
    category: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

function setSearch(search: string) {
  window.history.replaceState({}, "", `/products${search}`);
}

beforeEach(() => {
  vi.mocked(getToken).mockReturnValue("test-token");
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/products");
});

describe("WishlistProducts", () => {
  it("renders nothing when no wishlistId in URL", () => {
    const { container } = render(<WishlistProducts />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows loading state initially when wishlistId is present", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockResolvedValue(products);
    render(<WishlistProducts />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("renders product list after loading", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockResolvedValue(products);
    render(<WishlistProducts />);

    await waitFor(() => {
      expect(screen.getByText("テスト商品 A")).toBeInTheDocument();
      expect(screen.getByText("テスト商品 B")).toBeInTheDocument();
    });

    expect(api.wishlists.products).toHaveBeenCalledWith("wl-1");
  });

  it("each product links to /products?asin=...", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockResolvedValue(products);
    render(<WishlistProducts />);

    await waitFor(() => {
      const linkA = screen.getByRole("link", { name: "テスト商品 A" });
      expect(linkA).toHaveAttribute("href", "/products?asin=B0000001");
      const linkB = screen.getByRole("link", { name: "テスト商品 B" });
      expect(linkB).toHaveAttribute("href", "/products?asin=B0000002");
    });
  });

  it("shows empty message when no products", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockResolvedValue([]);
    render(<WishlistProducts />);

    await waitFor(() => {
      expect(screen.getByText("商品がありません。")).toBeInTheDocument();
    });
  });

  it("shows error message when API fails", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockRejectedValue(new Error("Network error"));
    render(<WishlistProducts />);

    await waitFor(() => {
      expect(screen.getByText(/エラー:/)).toBeInTheDocument();
    });
  });

  it("shows login prompt and skips API call when no token", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(getToken).mockReturnValue(null);
    render(<WishlistProducts />);
    await waitFor(() => {
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
    });
    expect(api.wishlists.products).not.toHaveBeenCalled();
  });

  it("shows login prompt when API returns 401", async () => {
    setSearch("?wishlistId=wl-1");
    vi.mocked(api.wishlists.products).mockRejectedValue(
      new Error('API error 401: {"error":"Unauthorized"}'),
    );
    render(<WishlistProducts />);
    await waitFor(() => {
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
    });
  });
});
