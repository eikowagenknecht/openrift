import { BUTTON_PAD } from "./card-grid-constants";

// ── Grid gutter sizing ────────────────────────────────────────────────
// The single source of truth for the horizontal and vertical spacing of the
// card-browser grids (/cards, /collections, /decks/$deckId, /promos). Import
// `computeGridMetrics` (measured surfaces) or `gridGapCss` (pre-measurement /
// SSR surfaces) — never hardcode a gap next to one of those grids.
//
// Two surfaces stay outside this on purpose, both because their cells carry no
// BUTTON_PAD, so there is no padding for the gap to absorb and the gutter *is*
// the gap: deck check (`CHECK_GRID_GAP`, an auto-fill layout) and the deck
// overview (`DECK_GRID_GAP`, flex-wrap rows on a shared `--deck-card-w`). Both
// run a deliberately tighter scale than the browser grids.
//
// What a user sees between two adjacent cards is not the CSS `gap`: each cell
// carries BUTTON_PAD of its own padding, so the *gutter* is `gap + 2 × BUTTON_PAD`.
// Sizing the gutter, and letting the CSS gap absorb the padding, is what keeps
// dense layouts readable — a fixed 16px gap left 28px of whitespace between
// 102px cards at 12 columns, over a quarter of the card's own width.
//
// The gutter holds a constant fraction of the card width, clamped at both ends.
// GUTTER_RATIO is set to what the sparse layouts already looked like (~10.5%,
// the pre-ratio 28px against a 5-column card), so a dense grid reads no airier
// than a sparse one instead of merely stopping short of the old 27%. GUTTER_MAX
// then pins the sparse end to exactly its historical spacing (it binds above
// ~267px of card width) and GUTTER_MIN keeps cards off each other at extreme
// density.
//
// Reaching that ratio needs BUTTON_PAD small: the padding is a fixed share of
// every gutter, so a 6px pad put a hard 12px floor under it and 10.5% is
// unreachable below ~114px cards. It is 3px, which is why the ratio can bind
// all the way down. See card-grid-constants.ts for why 3px is enough.

/** Gutter as a fraction of the rendered card width, between the two clamps. */
export const GUTTER_RATIO = 0.105;
/** Tightest gutter, at the densest column counts. */
export const GUTTER_MIN = 10;
/** Widest gutter — the historical `gap-4` + 2 × `p-1.5` (6px) spacing, total. */
export const GUTTER_MAX = 28;

/** CSS `gap` bounds implied by the gutter clamps, with the cell padding absorbed. */
export const GRID_GAP_MIN = GUTTER_MIN - BUTTON_PAD * 2;
export const GRID_GAP_MAX = GUTTER_MAX - BUTTON_PAD * 2;

export interface GridMetrics {
  /** CSS `gap` for the grid, and the virtualizer's row gap. */
  gap: number;
  /** Rendered width of one cell, its own BUTTON_PAD included. */
  cardWidth: number;
  /** Whitespace a user sees between two adjacent cards: `gap + 2 × BUTTON_PAD`. */
  gutter: number;
}

/**
 * Resolve the gap and cell width for a measured grid.
 *
 * `gutter = GUTTER_RATIO × cardWidth` and `cardWidth = (W − gap × (c−1)) / c`
 * look circular, but substituting `gap = gutter − 2 × BUTTON_PAD` solves in
 * closed form, so the ratio never has to be iterated:
 *
 *     cardWidth = (W + 2 × BUTTON_PAD × (c−1)) / (c + GUTTER_RATIO × (c−1))
 *
 * The clamps then break the proportionality, so the width is re-derived from
 * the clamped gap rather than reusing the closed-form value.
 * @param containerWidth Measured width of the grid container, in px.
 * @param columns Resolved column count (auto or the user's override).
 * @returns The gap, gutter and cell width for that container.
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
 * The same rule as a CSS value, for grids whose column count comes from
 * container-query classes (`SSR_RESPONSIVE_GRID_COLS`) because nothing has been
 * measured yet. `cqw` resolves against `@container/grid`, so the browser
 * evaluates the identical formula against the real container width during SSR
 * and the pre-hydration paint, and the cards don't shift when the live grid
 * takes over.
 *
 * The ratio binds in every band, so each needs its own expression — see
 * `SSR_RESPONSIVE_GRID_GAP` in use-responsive-columns.ts, whose literal class
 * strings this generates and whose test pins them against it.
 * @param columns Column count the expression is derived for.
 * @returns A CSS `clamp()` expression in `cqw` units.
 */
export function gridGapCss(columns: number): string {
  const cols = Math.max(1, Math.trunc(columns));
  const spanning = cols - 1;
  const divisor = cols + GUTTER_RATIO * spanning;
  // gap = RATIO × (100cqw + 2·PAD·(c−1)) / divisor − 2·PAD, expanded so the
  // container width stays in `cqw` and everything else folds into one px term.
  const perCqw = round4((GUTTER_RATIO * 100) / divisor);
  const offset = round4((GUTTER_RATIO * BUTTON_PAD * 2 * spanning) / divisor - BUTTON_PAD * 2);
  const sign = offset < 0 ? "-" : "+";
  // No spaces after the commas: these go into Tailwind arbitrary values, where
  // every space has to become an underscore. CSS requires the ones inside
  // calc() around the operator, so those are the only two left.
  return `clamp(${GRID_GAP_MIN}px,calc(${perCqw}cqw ${sign} ${Math.abs(offset)}px),${GRID_GAP_MAX}px)`;
}
