import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./use-hydrated";

describe("useHydrated", () => {
  // jsdom uses the client snapshot from useSyncExternalStore, so the hook
  // always reads `true` here. The SSR-only `false` branch is exercised by
  // React itself in real server rendering and can't be reproduced without
  // a server bundle.
  it("returns true on the client", () => {
    const { result, rerender } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(true);
  });
});
