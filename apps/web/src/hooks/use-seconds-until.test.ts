import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSecondsUntil } from "./use-seconds-until";

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSecondsUntil", () => {
  it("starts at the full remaining seconds", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW + 30_000));

    expect(result.current).toBe(30);
  });

  it("rounds a partial second up so the first tick is visible", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW + 29_400));

    expect(result.current).toBe(30);
  });

  it("counts down once a second", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW + 30_000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(29);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(25);
  });

  it("clamps at zero once the deadline passes", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW + 2000));

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current).toBe(0);
  });

  it("reports zero for a deadline already in the past", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW - 5000));

    expect(result.current).toBe(0);
  });

  it("restarts from the new deadline when it moves", () => {
    const { result, rerender } = renderHook(({ deadline }) => useSecondsUntil(deadline), {
      initialProps: { deadline: NOW + 30_000 },
    });

    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(result.current).toBe(5);

    rerender({ deadline: NOW + 25_000 + 30_000 });
    expect(result.current).toBe(30);
  });

  it("catches up after a suspended tab skips ticks", () => {
    const { result } = renderHook(() => useSecondsUntil(NOW + 30_000));

    act(() => {
      vi.setSystemTime(NOW + 19_000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(10);
  });

  it("reports zero and starts no timer for a null deadline", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const { result } = renderHook(() => useSecondsUntil(null));

    expect(result.current).toBe(0);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it("stops ticking after unmount", () => {
    const { result, unmount } = renderHook(() => useSecondsUntil(NOW + 30_000));

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(30);
  });
});
