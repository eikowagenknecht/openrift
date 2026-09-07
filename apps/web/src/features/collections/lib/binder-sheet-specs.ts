/**
 * Binder-sheet sizes and papers: the tables the dialog's selects render from.
 *
 * Split out of `binder-sheet-pdf` so a component can label its controls without
 * importing the generator, which pulls in jsPDF, the QR encoder and the brand
 * logo raster. `binder-sheet-pdf` re-exports the names its own callers still
 * import from it, so those imports keep working.
 */

export type BinderSheetSize = "card" | "2x2" | "3x3";
export type BinderSheetPaper = "a4" | "letter";
export type BinderSheetStyle = "light" | "dark";

export interface BinderSheetSpec {
  label: string;
  hint: string;
  /** mm */
  width: number;
  /** mm */
  height: number;
  cols: number;
  rows: number;
}

/** mm; matches the proxy printer. */
export const CARD_WIDTH_MM = 63;
const CARD_HEIGHT_MM = 88;

export const BINDER_SHEET_SPECS: Record<BinderSheetSize, BinderSheetSpec> = {
  card: {
    label: "Card size",
    hint: "63 × 88 mm, 9 per page",
    width: CARD_WIDTH_MM,
    height: CARD_HEIGHT_MM,
    cols: 3,
    rows: 3,
  },
  "2x2": {
    label: "2×2 binder page",
    hint: "126 × 176 mm, 1 per page",
    width: 2 * CARD_WIDTH_MM,
    height: 2 * CARD_HEIGHT_MM,
    cols: 1,
    rows: 1,
  },
  "3x3": {
    label: "3×3 binder page",
    hint: "189 × 264 mm, 1 per page",
    width: 3 * CARD_WIDTH_MM,
    height: 3 * CARD_HEIGHT_MM,
    cols: 1,
    rows: 1,
  },
};

export const BINDER_SHEET_PAPERS: Record<
  BinderSheetPaper,
  { label: string; width: number; height: number }
> = {
  a4: { label: "A4", width: 210, height: 297 },
  letter: { label: "US Letter", width: 215.9, height: 279.4 },
};
