import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useScopeEffect } from "./use-scope-effect";

describe("useScopeEffect", () => {
  it("runs for the first scope", () => {
    const run = vi.fn();
    renderHook(() => useScopeEffect("a", run));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("a");
  });

  it("runs again on a new scope", () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ scope }) => useScopeEffect(scope, run), {
      initialProps: { scope: "a" },
    });
    rerender({ scope: "b" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("b");
  });

  it("stays quiet while the scope is unchanged", () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ scope }) => useScopeEffect(scope, run), {
      initialProps: { scope: "a" },
    });
    rerender({ scope: "a" });
    rerender({ scope: "a" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("tears the previous scope down before running the next", () => {
    const order: string[] = [];
    const { rerender } = renderHook(
      ({ scope }) =>
        useScopeEffect(scope, (value) => {
          order.push(`setup:${value}`);
          return () => order.push(`cleanup:${value}`);
        }),
      { initialProps: { scope: "a" } },
    );
    rerender({ scope: "b" });
    expect(order).toEqual(["setup:a", "cleanup:a", "setup:b"]);
  });

  it("tears down on unmount", () => {
    const cleanup = vi.fn();
    const { unmount } = renderHook(() => useScopeEffect("a", () => cleanup));
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("sees the latest callback without re-running", () => {
    let seen = "";
    const { rerender } = renderHook(
      ({ scope, label }) =>
        useScopeEffect(scope, () => {
          seen = label;
        }),
      { initialProps: { scope: "a", label: "first" } },
    );
    rerender({ scope: "a", label: "second" });
    expect(seen).toBe("first");
    rerender({ scope: "b", label: "second" });
    expect(seen).toBe("second");
  });
});
