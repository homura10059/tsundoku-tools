import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Wishlist } from "@tsundoku-tools/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  api: {
    wishlists: {
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from "../lib/api.js";
import WishlistList from "./WishlistList.js";

const wishlist: Wishlist = {
  id: "wl-1",
  amazonListId: "LISTID",
  label: "技術書",
  url: "https://www.amazon.co.jp/wishlist/ls/LISTID",
  isActive: true,
  scrapeIntervalMinutes: 360,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

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
});
