import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  api: {
    wishlists: {
      create: vi.fn(),
    },
  },
}));

import { api } from "../lib/api.js";
import { WishlistForm } from "./WishlistForm.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("WishlistForm", () => {
  it("renders name and URL inputs", () => {
    render(<WishlistForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("名前")).toBeInTheDocument();
    expect(screen.getByLabelText("Amazon ウィッシュリスト URL")).toBeInTheDocument();
  });

  it("calls api.wishlists.create with input values on submit", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(api.wishlists.create).mockResolvedValue({} as never);

    render(<WishlistForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("名前"), "技術書");
    await user.type(
      screen.getByLabelText("Amazon ウィッシュリスト URL"),
      "https://www.amazon.co.jp/wishlist/ls/TESTID",
    );
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(api.wishlists.create).toHaveBeenCalledWith({
        label: "技術書",
        url: "https://www.amazon.co.jp/wishlist/ls/TESTID",
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error when API fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.wishlists.create).mockRejectedValue(new Error("Server error"));

    render(<WishlistForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("名前"), "Tech");
    await user.type(
      screen.getByLabelText("Amazon ウィッシュリスト URL"),
      "https://www.amazon.co.jp/wishlist/ls/X",
    );
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText(/Server error/)).toBeInTheDocument();
    });
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<WishlistForm onSuccess={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
