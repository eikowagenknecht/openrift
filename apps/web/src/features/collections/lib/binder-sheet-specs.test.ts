import { describe, expect, it } from "vitest";

import type { BinderSheetSize } from "./binder-sheet-specs";
import { BINDER_SHEET_PAPERS, BINDER_SHEET_SPECS, CARD_WIDTH_MM } from "./binder-sheet-specs";

const SIZES = Object.keys(BINDER_SHEET_SPECS) as BinderSheetSize[];
const CARD_HEIGHT_MM = BINDER_SHEET_SPECS.card.height;

describe("BINDER_SHEET_SPECS", () => {
  it("sizes a card sheet to a single card", () => {
    expect(BINDER_SHEET_SPECS.card.width).toBe(CARD_WIDTH_MM);
    expect(BINDER_SHEET_SPECS.card.height).toBe(CARD_HEIGHT_MM);
  });

  it("fills a card sheet with a three by three grid", () => {
    expect(BINDER_SHEET_SPECS.card.cols * BINDER_SHEET_SPECS.card.rows).toBe(9);
  });

  it("sizes the binder pages as whole multiples of a card", () => {
    expect(BINDER_SHEET_SPECS["2x2"].width).toBe(2 * CARD_WIDTH_MM);
    expect(BINDER_SHEET_SPECS["2x2"].height).toBe(2 * CARD_HEIGHT_MM);
    expect(BINDER_SHEET_SPECS["3x3"].width).toBe(3 * CARD_WIDTH_MM);
    expect(BINDER_SHEET_SPECS["3x3"].height).toBe(3 * CARD_HEIGHT_MM);
  });

  it("prints one binder page per sheet", () => {
    expect(BINDER_SHEET_SPECS["2x2"].cols * BINDER_SHEET_SPECS["2x2"].rows).toBe(1);
    expect(BINDER_SHEET_SPECS["3x3"].cols * BINDER_SHEET_SPECS["3x3"].rows).toBe(1);
  });

  it("states the real dimensions and per-page count in every hint", () => {
    for (const size of SIZES) {
      const spec = BINDER_SHEET_SPECS[size];
      expect(spec.hint).toContain(`${spec.width} × ${spec.height} mm`);
      expect(spec.hint).toContain(`${spec.cols * spec.rows} per page`);
    }
  });

  it("labels every size", () => {
    for (const size of SIZES) {
      expect(BINDER_SHEET_SPECS[size].label).not.toBe("");
    }
  });
});

describe("BINDER_SHEET_PAPERS", () => {
  it("keeps every sheet inside every paper", () => {
    for (const paper of Object.values(BINDER_SHEET_PAPERS)) {
      for (const size of SIZES) {
        const spec = BINDER_SHEET_SPECS[size];
        expect(spec.width).toBeLessThanOrEqual(paper.width);
        expect(spec.height).toBeLessThanOrEqual(paper.height);
      }
    }
  });

  it("prints A4 and US Letter in portrait", () => {
    for (const paper of Object.values(BINDER_SHEET_PAPERS)) {
      expect(paper.height).toBeGreaterThan(paper.width);
    }
  });
});
