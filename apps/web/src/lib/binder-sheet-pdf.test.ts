import { describe, expect, it } from "vitest";

import type { BinderSheetPaper, BinderSheetSize, SheetLayout } from "./binder-sheet-pdf";
import {
  BINDER_SHEET_PAPERS,
  BINDER_SHEET_SPECS,
  binderSheetFilename,
  fitFontSize,
  qrPixelWidth,
  rulerPlacement,
  sheetLayout,
  sheetMetrics,
  truncateToWidth,
} from "./binder-sheet-pdf";

const SIZES = Object.keys(BINDER_SHEET_SPECS) as BinderSheetSize[];
const PAPERS = Object.keys(BINDER_SHEET_PAPERS) as BinderSheetPaper[];

describe("sheetLayout", () => {
  it("centres the block on the page for every size and paper", () => {
    for (const size of SIZES) {
      for (const paper of PAPERS) {
        const layout = sheetLayout(size, paper);
        expect(layout.marginX * 2 + layout.cols * layout.sheetWidth).toBeCloseTo(layout.pageWidth);
        expect(layout.marginY * 2 + layout.rows * layout.sheetHeight).toBeCloseTo(
          layout.pageHeight,
        );
      }
    }
  });

  it("keeps every shipped size on the paper at true scale", () => {
    for (const size of SIZES) {
      for (const paper of PAPERS) {
        const layout = sheetLayout(size, paper);
        expect(layout.marginX).toBeGreaterThanOrEqual(0);
        expect(layout.marginY).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("prints the card size 9-up and the binder pages one-up", () => {
    expect(sheetLayout("card", "a4")).toMatchObject({ cols: 3, rows: 3 });
    expect(sheetLayout("2x2", "a4")).toMatchObject({ cols: 1, rows: 1 });
    expect(sheetLayout("3x3", "a4")).toMatchObject({ cols: 1, rows: 1 });
  });

  it("sizes sheets as whole cards", () => {
    expect(sheetLayout("card", "a4")).toMatchObject({ sheetWidth: 63, sheetHeight: 88 });
    expect(sheetLayout("2x2", "a4")).toMatchObject({ sheetWidth: 126, sheetHeight: 176 });
    expect(sheetLayout("3x3", "a4")).toMatchObject({ sheetWidth: 189, sheetHeight: 264 });
  });
});

describe("rulerPlacement", () => {
  it("uses the bottom margin when it is deep enough", () => {
    const layout = sheetLayout("3x3", "a4");
    const placement = rulerPlacement(layout);
    expect(placement).not.toBeNull();
    expect(placement?.vertical).toBe(false);
    // Inside the bottom margin band, clear of the sheet's cut line.
    expect(placement?.y).toBeGreaterThan(layout.marginY + layout.sheetHeight);
    expect(placement?.y).toBeLessThan(layout.pageHeight);
  });

  it("falls back to the side margin on Letter, whose bottom band is thin", () => {
    const layout = sheetLayout("3x3", "letter");
    expect(layout.marginY).toBeLessThan(9);
    const placement = rulerPlacement(layout);
    expect(placement?.vertical).toBe(true);
    expect(placement?.x).toBeLessThan(layout.marginX);
    expect(placement?.x).toBeGreaterThan(0);
  });

  it("stays inside the page when drawn vertically", () => {
    const layout = sheetLayout("card", "letter");
    const placement = rulerPlacement(layout);
    // 50 mm is the bar length; it runs downward from the placement origin.
    expect((placement?.y ?? 0) + 50).toBeLessThan(layout.pageHeight);
  });

  it("is skipped when no margin can hold it", () => {
    const tight: SheetLayout = {
      pageWidth: 200,
      pageHeight: 200,
      sheetWidth: 190,
      sheetHeight: 195,
      cols: 1,
      rows: 1,
      marginX: 5,
      marginY: 2.5,
    };
    expect(rulerPlacement(tight)).toBeNull();
  });
});

describe("sheetMetrics", () => {
  it("scales the furniture with the sheet width", () => {
    const card = sheetMetrics("card");
    const big = sheetMetrics("3x3");
    expect(big.title).toBeCloseTo(card.title * 3);
    expect(big.subtitle).toBeCloseTo(card.subtitle * 3);
    expect(big.pad).toBeCloseTo(card.pad * 3);
  });

  it("caps the QR so the title and footer keep their room", () => {
    // The card is bound by its height share, the binder page by the absolute cap.
    expect(sheetMetrics("card").qrMax).toBeCloseTo(BINDER_SHEET_SPECS.card.height * 0.5);
    const big = sheetMetrics("3x3");
    expect(big.qrMax).toBe(120);
    expect(big.qrMax).toBeLessThan(BINDER_SHEET_SPECS["3x3"].width - big.pad * 2);
  });

  it("keeps the QR inside the card sheet's padded width", () => {
    const card = sheetMetrics("card");
    expect(card.qrMax).toBeLessThanOrEqual(BINDER_SHEET_SPECS.card.width - card.pad * 2);
    expect(card.qrMax).toBeGreaterThan(30);
  });
});

describe("fitFontSize", () => {
  // Stand-in for jsPDF's measurer: width grows with characters and font size.
  const measure = (text: string, size: number) => text.length * size * 0.5;

  it("keeps the starting size when the text already fits", () => {
    expect(fitFontSize(measure, "Kai", 100, 12, 6)).toBe(12);
  });

  it("shrinks until the text fits", () => {
    const size = fitFontSize(measure, "Scan to see my trades", 60, 12, 4);
    expect(size).toBeLessThan(12);
    expect(measure("Scan to see my trades", size)).toBeLessThanOrEqual(60);
  });

  it("never goes below the floor, even when nothing fits", () => {
    expect(fitFontSize(measure, "x".repeat(500), 10, 12, 5)).toBe(5);
  });
});

describe("truncateToWidth", () => {
  const measure = (text: string, size: number) => text.length * size * 0.5;

  it("leaves text that fits untouched", () => {
    expect(truncateToWidth(measure, "Summoner Kai", 100, 8)).toBe("Summoner Kai");
  });

  it("ellipsises text that overflows at the smallest size", () => {
    const result = truncateToWidth(measure, "A very long binder title indeed", 20, 4);
    expect(result.endsWith("…")).toBe(true);
    expect(measure(result, 4)).toBeLessThanOrEqual(20);
  });

  it("does not leave a dangling space before the ellipsis", () => {
    // The cut lands mid-space ("Kai trades |here"), so the space is dropped.
    expect(truncateToWidth(measure, "Kai trades here", 12, 2)).toBe("Kai trades…");
  });

  it("returns nothing when not even the ellipsis fits", () => {
    expect(truncateToWidth(measure, "Kai", 0.1, 4)).toBe("");
  });
});

describe("qrPixelWidth", () => {
  it("renders at 300 dpi", () => {
    expect(qrPixelWidth(90)).toBe(Math.ceil((90 / 25.4) * 300));
  });

  it("clamps small and large codes", () => {
    expect(qrPixelWidth(1)).toBe(512);
    expect(qrPixelWidth(10_000)).toBe(2048);
  });
});

describe("binderSheetFilename", () => {
  it("slugifies the hint", () => {
    expect(binderSheetFilename("Trade Binder #1")).toBe("openrift-binder-trade-binder-1.pdf");
  });

  it("falls back when the hint is empty or unusable", () => {
    expect(binderSheetFilename()).toBe("openrift-binder-sheet.pdf");
    expect(binderSheetFilename("   ")).toBe("openrift-binder-sheet.pdf");
    expect(binderSheetFilename("!!!")).toBe("openrift-binder-sheet.pdf");
  });
});
