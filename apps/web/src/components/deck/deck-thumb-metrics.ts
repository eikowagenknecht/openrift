/**
 * Thumb sizing shared by the deck overview's zone tiles and the used-tokens
 * section below them.
 *
 * Both read `--deck-card-w`, the single measured card width the overview
 * publishes on its content wrapper, so every thumb on the surface lands on the
 * same column grid. Portrait thumbs are one card wide; landscape (battlefield)
 * art is rotated, so it spans a card's *height* instead, keeping the two
 * orientations on one scale.
 *
 * The fallback matters for the tokens section alone: `--deck-card-w` is set by
 * the grid container, which list mode doesn't render.
 */
export const PORTRAIT_THUMB_STYLE: React.CSSProperties = { width: "var(--deck-card-w, 7.5rem)" };

export const LANDSCAPE_THUMB_STYLE: React.CSSProperties = {
  width: "calc(var(--deck-card-w, 7.5rem) * 88 / 63)",
};

/** Aspect classes matching the two thumb styles above. */
export const PORTRAIT_THUMB_CLASS = "aspect-card max-w-full";
export const LANDSCAPE_THUMB_CLASS = "aspect-[88/63] max-w-full";
