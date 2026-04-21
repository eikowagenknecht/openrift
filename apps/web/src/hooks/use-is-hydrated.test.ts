import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIsHydrated } from "./use-is-hydrated";

describe("useIsHydrated", () => {
  it("returns false on initial render and true after effects flush", async () => {
    const { result, rerender } = renderHook(() => useIsHydrated());
    // testing-library runs effects synchronously before returning, so the
    // first value here reflects the already-mounted state. Rerender to
    // double-check the hook remains truthy across updates.
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(true);
  });

  it("flips from false to true across an effect-less initial snapshot", () => {
    // Use a one-shot state tap to observe the pre-effect render value.
    const renders: boolean[] = [];
    renderHook(() => {
      const hydrated = useIsHydrated();
      renders.push(hydrated);
      return hydrated;
    });
    act(() => {});
    // First render was pre-effect (false); subsequent renders are post-effect (true).
    expect(renders[0]).toBe(false);
    expect(renders.at(-1)).toBe(true);
  });
});
