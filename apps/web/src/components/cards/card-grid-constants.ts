// ── Size-estimate constants (keep in sync with CardThumbnail / CardMetaLabel) ──
// These mirror Tailwind classes used in the rendered DOM so estimateRowHeight()
// can predict row heights without measuring. When a class changes, update
// the matching constant here.

export const CARD_ASPECT = 88 / 63; // standard playing card (63×88mm)
export const GAP = 16; // gap-4
export const BUTTON_PAD = 6; // p-1.5 on CardThumbnail <button>
export const APP_HEADER_HEIGHT = 56; // h-14

export const LABEL_WRAPPER_MT = 10; // mt-2.5 on CardThumbnail label wrapper
export const META_LABEL_PY = 4; // py-0.5 on CardMetaLabel root — 0.125rem × 2 sides × 16px = 4px total
export const META_LINE_HEIGHT = 16; // text-xs line-height (see note about sm:text-sm below)
export const META_LINE_GAP = 2; // space-y-0.5 between CardMetaLabel lines
export const PRICE_MT = 2; // mt-0.5 on price <p>
export const PRICE_LINE_HEIGHT = 16; // min-h-4 on price <p> (always rendered when visibleFields.price is on)
export const META_LINE_HEIGHT_SM = 20; // sm:text-sm line-height (line 1, non-compact only)
export const SM_BREAKPOINT = 640; // Tailwind sm: breakpoint (px)
export const COMPACT_THRESHOLD = 190; // cardWidth below which CardThumbnail uses compact layout

export const HEADER_PT = 16; // pt-4 on header row
export const HEADER_PB = 8; // pb-2 on header row
export const HEADER_CONTENT_HEIGHT = 20; // text-sm line-height (tallest child)

export const FALLBACK_ROW_HEIGHT = 200; // estimateRowHeight fallback for out-of-bounds index
