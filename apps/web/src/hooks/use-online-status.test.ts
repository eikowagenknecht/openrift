import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, afterEach, vi } from "vitest";

import { useOnlineStatus } from "./use-online-status";

describe("useOnlineStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when the browser is online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("returns false when the browser is offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("updates when an offline event fires", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => globalThis.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
  });

  it("updates when an online event fires", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => globalThis.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("removes event listeners on unmount", () => {
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    const removedEvents = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEvents).toContain("online");
    expect(removedEvents).toContain("offline");
  });
});
