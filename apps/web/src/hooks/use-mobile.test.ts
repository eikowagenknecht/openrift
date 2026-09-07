import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

function stubViewport(initialWidth: number) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("innerWidth", initialWidth);
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    resizeTo(width: number) {
      vi.stubGlobal("innerWidth", width);
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("is true below the 768px breakpoint", () => {
    stubViewport(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("is false at the breakpoint", () => {
    stubViewport(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("follows the viewport across the breakpoint", () => {
    const viewport = stubViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => viewport.resizeTo(500));
    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    const viewport = stubViewport(1024);
    const { unmount } = renderHook(() => useIsMobile());
    expect(viewport.listenerCount()).toBe(1);
    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });
});
