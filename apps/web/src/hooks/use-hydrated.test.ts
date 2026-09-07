import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./use-hydrated";

describe("useHydrated", () => {
  // jsdom always uses the client snapshot, so the SSR-only `false` branch
  // can't be reproduced here.
  it("returns true on the client", () => {
    const { result, rerender } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(true);
  });
});
