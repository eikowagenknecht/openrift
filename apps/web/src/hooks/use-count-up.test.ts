import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useCountUp } from "./use-count-up";

describe("useCountUp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when target is 0", () => {
    const { result } = renderHook(() => useCountUp(0));
    expect(result.current).toBe(0);
  });

  it("starts at 0 and reaches the target after the duration", () => {
    const { result } = renderHook(() => useCountUp(100, 1000));
    expect(result.current).toBe(0);

    // Advance past the full duration
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current).toBe(100);
  });

  it("shows a partial value mid-animation", () => {
    const { result } = renderHook(() => useCountUp(1000, 1000));

    // At ~50% through a cubic ease-out, value should be well above 0 but below target
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(1000);
  });

  it("animates to the new target when it changes", () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 1000), {
      initialProps: { target: 100 },
    });

    // Complete first animation
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current).toBe(100);

    // Change target — new animation runs toward 200
    rerender({ target: 200 });
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current).toBe(200);
  });

  it("uses ease-out curve (faster at start, slower at end)", () => {
    const { result } = renderHook(() => useCountUp(1000, 1000));

    // At 25% time, ease-out cubic should yield more than 25% progress
    act(() => vi.advanceTimersByTime(250));
    const earlyValue = result.current;
    expect(earlyValue).toBeGreaterThan(250);
  });

  it("returns integer values only", () => {
    const { result } = renderHook(() => useCountUp(777, 1000));

    act(() => vi.advanceTimersByTime(333));
    expect(Number.isInteger(result.current)).toBe(true);
  });
});
