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

  // The initializer must be deterministic across SSR and client so the
  // hydrated grid's inline `gridTemplateColumns` matches the server-rendered
  // HTML. Reading `globalThis.innerWidth` here would return undefined on the
  // server and a real value on the client, producing a hydration mismatch on
  // SSR-rendered pages like /promos. The useLayoutEffect upgrades to the
  // measured column count before the browser paints.
  it.each([320, 640, 1024, 1280, 1920, 2560])(
    "starts at SSR-safe 2 columns regardless of innerWidth (%i)",
    (width) => {
      setInnerWidth(width);
      const { result } = renderHook(() => useResponsiveColumns());
      expect(result.current.columns).toBe(2);
      expect(result.current.autoColumns).toBe(2);
    },
  );

  it("reports measured=false on the initial render (before useLayoutEffect runs against a real container)", () => {
    // The hook only flips `measured` to true once updateColumns() runs with
    // a real containerRef. In the JSDOM test environment the ref is null, so
    // the effect bails before measuring. SSR consumers rely on this flag to
    // keep the CSS-only responsive grid in place until JS has the real width.
    const { result } = renderHook(() => useResponsiveColumns());
    expect(result.current.measured).toBe(false);
  });

  it("uses the explicit maxColumns argument verbatim in the initializer", () => {
    // The pMin/pMax clamp only kicks in once a real container width is
    // measured; the initializer just trusts the user-chosen value.
    setInnerWidth(1920);
    const { result } = renderHook(() => useResponsiveColumns(3));
    expect(result.current.columns).toBe(3);
  });

  it("falls back to the SSR-safe default when maxColumns is null (auto mode)", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useResponsiveColumns(null));
    expect(result.current.columns).toBe(2);
    expect(result.current.autoColumns).toBe(2);
  });
});
