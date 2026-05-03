import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AmazonListId, Wishlist, WishlistId } from "@tsundoku-tools/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  api: {
    wishlists: {
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      scrape: vi.fn(),
    },
  },
}));

vi.mock("../lib/auth.js", () => ({
  getToken: vi.fn(),
}));

import { api } from "../lib/api.js";
import { getToken } from "../lib/auth.js";
import WishlistList from "./WishlistList.js";

const wishlist: Wishlist = {
  id: "wl-1" as WishlistId,
  amazonListId: "LISTID" as AmazonListId,
  label: "技術書",
  url: "https://www.amazon.co.jp/wishlist/ls/LISTID",
  isActive: true,
  scrapeIntervalMinutes: 360,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(getToken).mockReturnValue("test-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("WishlistList", () => {
  it("shows loading state initially", () => {
    vi.mocked(api.wishlists.list).mockReturnValue(new Promise(() => {}));
    render(<WishlistList />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("renders wishlists after loading", async () => {
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    render(<WishlistList />);
    await waitFor(() => {
      expect(screen.getByText("技術書")).toBeInTheDocument();
    });
  });

  it("shows empty message when no wishlists", async () => {
    vi.mocked(api.wishlists.list).mockResolvedValue([]);
    render(<WishlistList />);
    await waitFor(() => {
      expect(screen.getByText("ウィッシュリストがまだありません。")).toBeInTheDocument();
    });
  });

  it("shows error when loading fails", async () => {
    vi.mocked(api.wishlists.list).mockRejectedValue(new Error("Network error"));
    render(<WishlistList />);
    await waitFor(() => {
      expect(screen.getByText(/エラー:/)).toBeInTheDocument();
    });
  });

  it("shows login prompt and skips API call when no token", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    render(<WishlistList />);
    await waitFor(() => {
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
    });
    expect(api.wishlists.list).not.toHaveBeenCalled();
  });

  it("shows login prompt when API returns 401", async () => {
    vi.mocked(api.wishlists.list).mockRejectedValue(
      new Error('API error 401: {"error":"Unauthorized"}'),
    );
    render(<WishlistList />);
    await waitFor(() => {
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
    });
  });

  it("calls api.wishlists.update to toggle active status", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.update).mockResolvedValue({ ...wishlist, isActive: false });

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "停止" }));
    await user.click(screen.getByRole("button", { name: "停止" }));

    await waitFor(() => {
      expect(api.wishlists.update).toHaveBeenCalledWith("wl-1", { isActive: false });
    });
  });

  it("calls api.wishlists.delete after confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.delete).mockResolvedValue(undefined);
    vi.stubGlobal("confirm", () => true);

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "削除" }));
    await user.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(api.wishlists.delete).toHaveBeenCalledWith("wl-1");
    });
    vi.unstubAllGlobals();
  });

  it("does not delete when confirm is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.stubGlobal("confirm", () => false);

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "削除" }));
    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(api.wishlists.delete).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("calls api.wishlists.scrape when scrape button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.scrape).mockResolvedValue({ jobId: "job-1" });

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "今すぐスクレイプ" }));
    await user.click(screen.getByRole("button", { name: "今すぐスクレイプ" }));

    await waitFor(() => {
      expect(api.wishlists.scrape).toHaveBeenCalledWith("wl-1");
    });
  });

  it("shows loading state while scrape is in progress", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.scrape).mockReturnValue(new Promise(() => {}));

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "今すぐスクレイプ" }));
    await user.click(screen.getByRole("button", { name: "今すぐスクレイプ" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "スクレイプ中…" })).toBeDisabled();
    });
  });

  it("shows error message when scrape fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.scrape).mockRejectedValue(new Error("API error 401: Unauthorized"));

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "今すぐスクレイプ" }));
    await user.click(screen.getByRole("button", { name: "今すぐスクレイプ" }));

    await waitFor(() => {
      expect(screen.getByText(/スクレイプに失敗しました/)).toBeInTheDocument();
    });
  });

  it("re-enables scrape button after failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.list).mockResolvedValue([wishlist]);
    vi.mocked(api.wishlists.scrape).mockRejectedValue(new Error("Network error"));

    render(<WishlistList />);
    await waitFor(() => screen.getByRole("button", { name: "今すぐスクレイプ" }));
    await user.click(screen.getByRole("button", { name: "今すぐスクレイプ" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "今すぐスクレイプ" })).not.toBeDisabled();
    });
  });
});
