import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrintingHover } from "./use-printing-hover";

describe("usePrintingHover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no hovered id", () => {
    const { result } = renderHook(() => usePrintingHover());
    expect(result.current.hoveredId).toBeNull();
  });

  it("onEnter sets the hovered id immediately", () => {
    const { result } = renderHook(() => usePrintingHover());
    act(() => result.current.onEnter("a"));
    expect(result.current.hoveredId).toBe("a");
  });

  it("onLeave clears the hovered id only after the debounce delay", () => {
    const { result } = renderHook(() => usePrintingHover(80));
    act(() => result.current.onEnter("a"));
    act(() => result.current.onLeave());
    expect(result.current.hoveredId).toBe("a");
    act(() => vi.advanceTimersByTime(79));
    expect(result.current.hoveredId).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.hoveredId).toBeNull();
  });

  it("onEnter cancels a pending clear so adjacent items don't flash", () => {
    const { result } = renderHook(() => usePrintingHover(80));
    act(() => result.current.onEnter("a"));
    act(() => result.current.onLeave());
    act(() => result.current.onEnter("b"));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.hoveredId).toBe("b");
  });

  it("reset clears immediately and cancels any pending clear", () => {
    const { result } = renderHook(() => usePrintingHover(80));
    act(() => result.current.onEnter("a"));
    act(() => result.current.onLeave());
    act(() => result.current.reset());
    expect(result.current.hoveredId).toBeNull();
    // Advancing past the old timer must not flip state back.
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.hoveredId).toBeNull();
  });

  it("unmount cancels the pending clear without firing a state update", () => {
    const { result, unmount } = renderHook(() => usePrintingHover(80));
    act(() => result.current.onEnter("a"));
    act(() => result.current.onLeave());
    unmount();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });
});
