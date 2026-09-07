import { describe, expect, it } from "vitest";

import { BUTTON_PAD } from "@/lib/card-grid-constants";
import {
  computeGridMetrics,
  GRID_GAP_MAX,
  GRID_GAP_MIN,
  gridGapCss,
  GUTTER_MAX,
  GUTTER_MIN,
  GUTTER_RATIO,
} from "@/lib/card-grid-metrics";

describe("computeGridMetrics", () => {
  it("fills the container exactly", () => {
    for (const columns of [1, 2, 5, 8, 12, 20]) {
      const { gap, cardWidth } = computeGridMetrics(1400, columns);
      expect(cardWidth * columns + gap * (columns - 1)).toBeCloseTo(1400, 6);
    }
  });

  it("keeps the historical spacing wherever cards are comfortably large", () => {
    const { gap, gutter } = computeGridMetrics(1400, 5);
    expect(gap).toBe(GRID_GAP_MAX);
    expect(gutter).toBe(GUTTER_MAX);
  });

  it("tightens the gap as the cards get smaller", () => {
    const wide = computeGridMetrics(1400, 8);
    const dense = computeGridMetrics(1400, 12);
    expect(dense.gap).toBeLessThan(wide.gap);
    expect(dense.cardWidth).toBeGreaterThan((1400 - GRID_GAP_MAX * 11) / 12);
  });

  it("holds the gutter at GUTTER_RATIO of the card between the clamps", () => {
    const { gutter, cardWidth } = computeGridMetrics(1400, 12);
    expect(gutter).toBeGreaterThan(GUTTER_MIN);
    expect(gutter).toBeLessThan(GUTTER_MAX);
    expect(gutter / cardWidth).toBeCloseTo(GUTTER_RATIO, 2);
  });

  it("clamps at both ends", () => {
    expect(computeGridMetrics(1400, 40).gutter).toBe(GUTTER_MIN);
    expect(computeGridMetrics(4000, 2).gutter).toBe(GUTTER_MAX);
  });

  it("keeps gutter and gap one BUTTON_PAD pair apart", () => {
    for (const columns of [2, 7, 12, 30]) {
      const { gap, gutter } = computeGridMetrics(1400, columns);
      expect(gutter - gap).toBe(BUTTON_PAD * 2);
    }
  });

  it("never returns a negative card width for a degenerate container", () => {
    expect(computeGridMetrics(0, 8).cardWidth).toBe(0);
    expect(computeGridMetrics(0, 1).cardWidth).toBe(0);
  });

  it("gives a single column the whole container", () => {
    expect(computeGridMetrics(900, 1).cardWidth).toBe(900);
  });

  it("rounds the gap to whole pixels so row positions stay integral", () => {
    for (let columns = 1; columns <= 20; columns++) {
      expect(Number.isInteger(computeGridMetrics(1337, columns).gap)).toBe(true);
    }
  });
});

describe("gridGapCss", () => {
  it("agrees with computeGridMetrics across each band it is derived for", () => {
    const cases = [
      { columns: 2, widths: [280, 320, 430, 520, 639] },
      { columns: 3, widths: [640, 700, 767] },
      { columns: 5, widths: [1024, 1150, 1279] },
      { columns: 8, widths: [1920, 2200, 2560] },
    ];
    for (const { columns, widths } of cases) {
      for (const width of widths) {
        // The JS path rounds the gutter to whole pixels, the CSS one doesn't.
        const drift = Math.abs(
          evaluateGapCss(gridGapCss(columns), width) - computeGridMetrics(width, columns).gap,
        );
        expect(drift).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("emits a clamp bounded by the shared gap constants", () => {
    const css = gridGapCss(2);
    expect(css.startsWith(`clamp(${GRID_GAP_MIN}px,`)).toBe(true);
    expect(css.endsWith(`${GRID_GAP_MAX}px)`)).toBe(true);
  });

  it("emits no spaces outside the calc operator, so it survives as a Tailwind class", () => {
    expect(gridGapCss(4).split(" ")).toHaveLength(3);
  });
});

/**
 * Evaluate a `clamp(Apx, calc(B cqw ± Cpx), Dpx)` string the way a browser
 * would, with `containerWidth` standing in for the container `cqw` resolves against.
 */
function evaluateGapCss(css: string, containerWidth: number): number {
  const parsed =
    /^clamp\((?<min>[\d.]+)px,calc\((?<perCqw>[\d.]+)cqw (?<sign>[+-]) (?<offset>[\d.]+)px\),(?<max>[\d.]+)px\)$/u.exec(
      css,
    );
  if (!parsed?.groups) {
    throw new Error(`gridGapCss produced an unparseable expression: ${css}`);
  }
  const { min, perCqw, sign, offset, max } = parsed.groups;
  const value =
    (Number(perCqw) * containerWidth) / 100 + (sign === "-" ? -Number(offset) : Number(offset));
  return Math.min(Number(max), Math.max(Number(min), value));
}
