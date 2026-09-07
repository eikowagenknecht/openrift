import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIdle } from "./use-idle";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdle", () => {
  it("starts active so the controls are visible on open", () => {
    const { result } = renderHook(() => useIdle(1000));

    expect(result.current).toBe(false);
  });

  it("goes idle once the delay elapses", () => {
    const { result } = renderHook(() => useIdle(1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(true);
  });

  it("stays active while the delay has not fully elapsed", () => {
    const { result } = renderHook(() => useIdle(1000));

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(result.current).toBe(false);
  });

  it("wakes back up on activity and restarts the countdown", () => {
    const { result } = renderHook(() => useIdle(1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);

    act(() => {
      globalThis.dispatchEvent(new Event("pointermove"));
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it.each(["pointerdown", "keydown", "wheel", "touchstart"])("treats %s as activity", (event) => {
    const { result } = renderHook(() => useIdle(1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);

    act(() => {
      globalThis.dispatchEvent(new Event(event));
    });

    expect(result.current).toBe(false);
  });

  it("stops updating state after unmount", () => {
    const { result, unmount } = renderHook(() => useIdle(1000));

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(false);
  });
});
