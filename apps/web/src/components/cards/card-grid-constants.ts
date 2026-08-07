// ── Size-estimate constants (keep in sync with CardThumbnail / CardMetaLabel) ──
// These mirror Tailwind classes used in the rendered DOM so estimateRowHeight()
// can predict row heights without measuring. When a class changes, update
// the matching constant here.

// Height ÷ width for a standard 63×88mm card — the inverse of the canonical
// `--aspect-card` (63/88) CSS var and of card-designer's `CARD_ASPECT`. Named
// distinctly so the two reciprocal ratios can't be confused at an import site.
// Used as a width→height multiplier (height = width × CARD_ASPECT_INVERSE).
export const CARD_ASPECT_INVERSE = 88 / 63;

/**
 * Proportional card corner radius: 5% of the width and 3.6% of the height, which
 * for a 63×88 card is a near-circular ~5%-of-short-edge corner that scales with
 * the card instead of a fixed pixel radius. Shared by CardThumbnail, CardArtThumb
 * and the sets shelf so every card surface rounds identically. Keep in sync with
 * the server share-image radius (apps/api/.../share-image-core.ts `cardRadiusPx`).
 */
export const CARD_BORDER_RADIUS = "5% / 3.6%";

// The grid gap is not a constant — it scales with the card width so dense
// layouts don't drown small cards in whitespace. See `card-grid-metrics.ts`
// (`computeGridMetrics` for measured grids, `gridGapCss` for SSR ones); never
// hardcode a gap next to a card grid.

// p-0.75 on the CardThumbnail wrapper. Pure spacing: the hover ring is an
// outset box-shadow on the image shell and nothing clips it, and the selection
// tint is its own negative-inset layer, so neither needs room here. Kept small
// so the gutter it contributes doesn't set a floor on how tight a dense grid
// can get — see card-grid-metrics.ts.
export const BUTTON_PAD = 3;

export const LABEL_WRAPPER_MT = 10; // mt-2.5 on CardThumbnail label wrapper
export const META_LABEL_PY = 4; // py-0.5 on CardMetaLabel root — 0.125rem × 2 sides × 16px = 4px total
export const META_LINE_HEIGHT = 16; // text-xs line-height (see note about sm:text-sm below)
export const META_LINE_GAP = 2; // space-y-0.5 between CardMetaLabel lines

/** Total reserved height for a card cell's two-line label block. */
export const LABEL_HEIGHT =
  LABEL_WRAPPER_MT + META_LABEL_PY + META_LINE_HEIGHT + META_LINE_GAP + META_LINE_HEIGHT;
export const HEADER_PT = 16; // pt-4 on header row
export const HEADER_PB = 8; // pb-2 on header row
export const HEADER_CONTENT_HEIGHT = 20; // text-sm line-height (tallest child)

export const ADD_STRIP_HEIGHT = 24; // h-5 + mb-1 (20px row + 4px margin) — the CardStrip row above the card image (components/cards/card-strip.tsx)
export const FALLBACK_ROW_HEIGHT = 200; // estimateRowHeight fallback for out-of-bounds index
