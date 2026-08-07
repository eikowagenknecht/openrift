import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMeasuredWidth } from "./use-measured-width";

type ObserverCallback = (entries: ResizeObserverEntry[]) => void;

/**
 * Captures the observer callback so tests can fire fake measurements.
 * @returns The mutable state the stub writes into.
 */
function stubResizeObserver() {
  const state: { callback: ObserverCallback | null; disconnected: boolean } = {
    callback: null,
    disconnected: false,
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ObserverCallback) {
        state.callback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        state.disconnected = true;
      }
    },
  );
  return state;
}

function entryWith(width: number): ResizeObserverEntry {
  return {
    borderBoxSize: [{ inlineSize: width, blockSize: 0 }],
    contentRect: { width } as DOMRectReadOnly,
  } as unknown as ResizeObserverEntry;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMeasuredWidth", () => {
  it("returns 0 for a null element", () => {
    stubResizeObserver();
    const { result } = renderHook(() => useMeasuredWidth(null));
    expect(result.current).toBe(0);
  });

  it("publishes the observed border-box width, rounded", () => {
    const observer = stubResizeObserver();
    const el = document.createElement("div");
    const { result } = renderHook(() => useMeasuredWidth(el));
    act(() => observer.callback?.([entryWith(1199.6)]));
    expect(result.current).toBe(1200);
  });

  it("falls back to contentRect when borderBoxSize is empty", () => {
    const observer = stubResizeObserver();
    const el = document.createElement("div");
    const { result } = renderHook(() => useMeasuredWidth(el));
    act(() =>
      observer.callback?.([
        {
          borderBoxSize: [],
          contentRect: { width: 640 } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ]),
    );
    expect(result.current).toBe(640);
  });

  it("resets to 0 and disconnects when the element goes away", () => {
    const observer = stubResizeObserver();
    const el = document.createElement("div");
    const { result, rerender } = renderHook(({ node }) => useMeasuredWidth(node), {
      initialProps: { node: el as HTMLElement | null },
    });
    act(() => observer.callback?.([entryWith(800)]));
    expect(result.current).toBe(800);
    rerender({ node: null });
    expect(result.current).toBe(0);
    expect(observer.disconnected).toBe(true);
  });
});
