import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useResponsiveColumns } from "./use-responsive-columns";

const originalInnerWidth = globalThis.innerWidth;

function setInnerWidth(width: number): void {
  Object.defineProperty(globalThis, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
}

describe("useResponsiveColumns", () => {
  beforeEach(() => {
    setInnerWidth(originalInnerWidth);
  });

  afterEach(() => {
    setInnerWidth(originalInnerWidth);
  });

  // The useState initializer runs before any DOM measurement, so SSR-shipped
  // markup must derive its column count from this same table — otherwise the
  // hydrated grid disagrees with what the server painted on first paint.
  it.each([
    [320, 2],
    [639, 2],
    [640, 3],
    [767, 3],
    [768, 4],
    [1023, 4],
    [1024, 5],
    [1279, 5],
    [1280, 6],
    [1599, 6],
    [1600, 7],
    [1919, 7],
    [1920, 8],
    [2560, 8],
  ])("at innerWidth=%i, the initial column count is %i", (width, expected) => {
    setInnerWidth(width);
    const { result } = renderHook(() => useResponsiveColumns());
    expect(result.current.columns).toBe(expected);
    expect(result.current.autoColumns).toBe(expected);
  });

  it("uses the explicit maxColumns argument verbatim in the initializer", () => {
    // The pMin/pMax clamp only kicks in once a real container width is
    // measured; the initializer just trusts the user-chosen value.
    setInnerWidth(1920);
    const { result } = renderHook(() => useResponsiveColumns(3));
    expect(result.current.columns).toBe(3);
  });

  it("falls back to autoColumns when maxColumns is null (auto mode)", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useResponsiveColumns(null));
    expect(result.current.columns).toBe(6);
    expect(result.current.autoColumns).toBe(6);
  });
});
