/**
 * Backgrounds for the bars and chips that sit above scrolling content — the
 * site header, the page top bar, the card-browser toolbar tiers, the scroll
 * indicator, the group-header pill.
 *
 * Opaque by default, frosted only when the user opts in (the "Frosted bars"
 * display preference, which sets `data-frosted` on the document element — see
 * `stores/display-store.ts`).
 *
 * The default is off because `backdrop-filter` re-reads and blurs whatever sits
 * behind the bar on every frame its backdrop moves, which is every frame of a
 * scroll. Measured on the /cards grid at 4× CPU throttle (a mid-range phone),
 * the stacked bars on that page turned a locked 60fps scroll into 26 dropped
 * frames out of 89; opaque, the same scroll holds a flat 16.7ms per frame with
 * nothing dropped. The radius is not the lever — `blur(24px)` down to
 * `blur(4px)` still cost 15 frames — so there is no cheaper version of the
 * effect, only having it or not.
 */
export const STICKY_SURFACE =
  "bg-background [[data-frosted]_&]:bg-background/80 [[data-frosted]_&]:backdrop-blur-lg";

/** As {@link STICKY_SURFACE}, on the popover palette. */
export const STICKY_SURFACE_POPOVER =
  "bg-popover [[data-frosted]_&]:bg-popover/90 [[data-frosted]_&]:backdrop-blur-sm";
