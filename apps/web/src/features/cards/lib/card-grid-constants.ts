// Mirrors Tailwind classes on CardThumbnail / CardMetaLabel so estimateRowHeight()
// can predict row heights without measuring. Update the matching constant here
// when a class changes.

// Keep in sync with the `--aspect-card` (63/88) CSS var and card-designer's `CARD_ASPECT`.
export const CARD_ASPECT_INVERSE = 88 / 63;

// Keep in sync with the server share-image radius (apps/api/.../share-image-core.ts `cardRadiusPx`).
export const CARD_BORDER_RADIUS = "5% / 3.6%";

// Kept small: the hover ring and selection tint are their own layers and need no room here.
export const BUTTON_PAD = 3;

export const LABEL_WRAPPER_MT = 10; // mt-2.5 on CardThumbnail label wrapper
export const META_LABEL_PY = 4; // py-0.5 on CardMetaLabel root
export const META_LINE_HEIGHT = 16; // text-xs line-height
export const META_LINE_GAP = 2; // space-y-0.5 between CardMetaLabel lines

/** Total reserved height for a card cell's two-line label block. */
export const LABEL_HEIGHT =
  LABEL_WRAPPER_MT + META_LABEL_PY + META_LINE_HEIGHT + META_LINE_GAP + META_LINE_HEIGHT;
export const HEADER_PT = 16; // pt-4 on header row
export const HEADER_PB = 8; // pb-2 on header row
export const HEADER_CONTENT_HEIGHT = 20; // text-sm line-height (tallest child)

export const ADD_STRIP_HEIGHT = 24; // h-5 + mb-1, the CardStrip row above the card image (components/cards/card-strip.tsx)
export const FALLBACK_ROW_HEIGHT = 200; // estimateRowHeight fallback for out-of-bounds index
