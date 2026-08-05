// Fake timers — no real setTimeout waits.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately, before the delay elapses", () => {
    const { result } = renderHook(() => useDebounce("first", 300));
    expect(result.current).toBe("first");
  });

  it("does not update until the delay has fully elapsed", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "first" },
    });

    rerender({ value: "second" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("second");
  });

  it("resets the timer on every change — only the final value ever commits", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "f" },
    });

    rerender({ value: "fi" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "fir" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "first" });

    // Only 200ms since the last change so far — well under the 300ms delay.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("f");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("first");
  });
});
