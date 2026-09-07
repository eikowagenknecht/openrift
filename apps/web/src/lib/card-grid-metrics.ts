import { BUTTON_PAD } from "@/lib/card-grid-constants";

// Single source of truth for the grid gutter of the card-browser grids
// (/cards, /collections, /decks/$deckId, /promos). Use computeGridMetrics
// (measured) or gridGapCss (SSR); never hardcode a gap next to one of those grids.
// Deck check and deck overview opt out: their cells carry no BUTTON_PAD, so
// gutter === gap there. Elsewhere gutter = gap + 2 × BUTTON_PAD.

export const GUTTER_RATIO = 0.105;
export const GUTTER_MIN = 10;
export const GUTTER_MAX = 28;

export const GRID_GAP_MIN = GUTTER_MIN - BUTTON_PAD * 2;
export const GRID_GAP_MAX = GUTTER_MAX - BUTTON_PAD * 2;

export interface GridMetrics {
  gap: number;
  cardWidth: number;
  gutter: number;
}

/**
 * `gutter = GUTTER_RATIO × cardWidth` and `cardWidth = (W − gap×(c−1))/c` solve in
 * closed form once `gap = gutter − 2×BUTTON_PAD` is substituted in.
 */
export function computeGridMetrics(containerWidth: number, columns: number): GridMetrics {
  const cols = Math.max(1, Math.trunc(columns));
  const spanning = cols - 1;
  const idealWidth =
    (containerWidth + BUTTON_PAD * 2 * spanning) / (cols + GUTTER_RATIO * spanning);
  const gutter = Math.min(GUTTER_MAX, Math.max(GUTTER_MIN, Math.round(GUTTER_RATIO * idealWidth)));
  const gap = gutter - BUTTON_PAD * 2;
  const cardWidth = Math.max(0, (containerWidth - gap * spanning) / cols);
  return { gap, cardWidth, gutter };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Same formula as a CSS `clamp()`, for grids whose columns come from container-query
 * classes (`SSR_RESPONSIVE_GRID_COLS`) before anything is measured. Pinned against
 * `SSR_RESPONSIVE_GRID_GAP` in use-responsive-columns.ts by its own test.
 */
export function gridGapCss(columns: number): string {
  const cols = Math.max(1, Math.trunc(columns));
  const spanning = cols - 1;
  const divisor = cols + GUTTER_RATIO * spanning;
  const perCqw = round4((GUTTER_RATIO * 100) / divisor);
  const offset = round4((GUTTER_RATIO * BUTTON_PAD * 2 * spanning) / divisor - BUTTON_PAD * 2);
  const sign = offset < 0 ? "-" : "+";
  // No spaces after the commas: Tailwind arbitrary values turn spaces into underscores.
  return `clamp(${GRID_GAP_MIN}px,calc(${perCqw}cqw ${sign} ${Math.abs(offset)}px),${GRID_GAP_MAX}px)`;
}
