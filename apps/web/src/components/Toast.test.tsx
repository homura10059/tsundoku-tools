import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast.js";

describe("Toast", () => {
  it("renders the message", () => {
    render(<Toast message="エラーが発生しました" onDismiss={() => {}} />);
    expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    render(<Toast message="エラー" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  describe("auto-dismiss", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("calls onDismiss automatically after duration", () => {
      const onDismiss = vi.fn();
      render(<Toast message="エラー" onDismiss={onDismiss} duration={3000} />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it("does not call onDismiss before duration", () => {
      const onDismiss = vi.fn();
      render(<Toast message="エラー" onDismiss={onDismiss} duration={3000} />);

      act(() => {
        vi.advanceTimersByTime(2999);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});
