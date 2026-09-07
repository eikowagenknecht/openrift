import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gridGapCss } from "@/components/cards/card-grid-metrics";

import {
  COLUMN_BANDS,
  SSR_RESPONSIVE_GRID_COLS,
  SSR_RESPONSIVE_GRID_GAP,
  useResponsiveColumns,
} from "./use-responsive-columns";

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

  // The initializer must be deterministic across SSR and client, or the
  // hydrated grid's inline gridTemplateColumns mismatches the server-rendered HTML.
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

  it("measures the container when the ref attaches on a render after the hook first ran", () => {
    const { result } = renderHook(() => useResponsiveColumns(6));
    expect(result.current.columns).toBe(6);
    expect(result.current.measured).toBe(false);

    const element = document.createElement("div");
    Object.defineProperty(element, "offsetWidth", { configurable: true, value: 300 });

    act(() => {
      result.current.containerRef(element);
    });

    expect(result.current.measured).toBe(true);
    // width 300 → physical max = floor((300+GRID_GAP_MIN)/(100+GRID_GAP_MIN)) = 2,
    // so 6 clamps to 2.
    expect(result.current.columns).toBe(2);
    expect(result.current.containerWidth).toBe(300);
  });
});

describe("SSR_RESPONSIVE_GRID_GAP", () => {
  // The class strings are written literally so Tailwind's scanner can find them,
  // so they can't be generated at runtime and must be checked against the live rule.
  it("matches gridGapCss for every band's column count", () => {
    const expected = COLUMN_BANDS.map((band) => {
      const value = gridGapCss(band.columns).replaceAll(" ", "_");
      return band.minWidth === 0
        ? `gap-[${value}]`
        : `@min-[${band.minWidth}px]/grid:gap-[${value}]`;
    }).join(" ");
    expect(SSR_RESPONSIVE_GRID_GAP).toBe(expected);
  });

  it("pairs one gap class with each column class", () => {
    expect(SSR_RESPONSIVE_GRID_GAP.split(" ")).toHaveLength(COLUMN_BANDS.length);
    expect(SSR_RESPONSIVE_GRID_COLS.split(" ")).toHaveLength(COLUMN_BANDS.length);
  });

  it("declares the same breakpoints as the column classes", () => {
    const breakpointsOf = (classes: string) =>
      classes.split(" ").map((c) => /^@min-\[(?<width>\d+)px\]/u.exec(c)?.groups?.width ?? "0");
    expect(breakpointsOf(SSR_RESPONSIVE_GRID_GAP)).toEqual(breakpointsOf(SSR_RESPONSIVE_GRID_COLS));
  });

  it("uses the column count the matching column class sets", () => {
    const cols = SSR_RESPONSIVE_GRID_COLS.split(" ").map((c) =>
      Number(/grid-cols-(?<n>\d+)$/u.exec(c)?.groups?.n),
    );
    expect(cols).toEqual(COLUMN_BANDS.map((band) => band.columns));
  });
});
