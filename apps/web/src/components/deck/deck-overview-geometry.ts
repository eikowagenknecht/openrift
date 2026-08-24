import type { DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Geometry for the deck overview's grid: the shared card width, the small-zone
 * row's column spans, and the stacks-mode strip model.
 *
 * Sibling of `deck-thumb-metrics.ts`, which owns the two thumb sizes. Both read
 * `--deck-card-w`, the single measured card width the overview publishes on its
 * content wrapper.
 */

/** Zones whose cards are landscape (battlefield art is rotated). */
export const LANDSCAPE_ZONES: ReadonlySet<DeckZone> = new Set([WellKnown.deckZone.BATTLEFIELD]);

// Small-zone row layout:
//  • @lg: 3 columns — Legend / Champion / Runes on row 1, Battlefield on row 2
//  • @5xl: 5 columns — all four on a single row (1+1+1+2)
export const SMALL_ZONES: DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
];

// Every thumb on the surface is one card wide. The width is measured once for
// the whole overview and published as --deck-card-w on the content wrapper, so
// a zone's flex-wrap rows land on the column grid without any zone needing to
// know the count. Gap between thumbs (gap-1.5) — the card width is derived from
// it, so the two must stay in step.
export const DECK_GRID_GAP = 6;

// Width until the container has been measured. Small enough that a phone
// always gets two cards per row, so the SSR paint never shows a giant card.
export const UNMEASURED_CARD_WIDTH = "min(11rem, 40vw)";

/** Card height as a multiple of its width — the stacks math needs the number. */
export const CARD_HEIGHT_RATIO = 88 / 63;

/** Vertical gap between stack strips; must match the pile's `gap-1` class. */
export const STACK_GAP_PX = 4;

/**
 * Corner radius of a resting stack strip: the same absolute corner size as
 * the canonical card radius (`CARD_BORDER_RADIUS`, 5% of the card width),
 * expressed against the width so it doesn't collapse on a ~20px-tall slice
 * the way the percentage pair's height component would.
 */
const STACK_STRIP_RADIUS_FRACTION = 0.05;

/**
 * Tight per-type name-bar windows for the stack strips, as fractions of card
 * height. These are the measured bars from the scanner's notes (see
 * NAME_BANDS in packages/shared/src/scan/disambiguate.ts) — the scanner's own
 * exported bands carry deliberate slack for its shift search, which showed as
 * strips much taller than the colored name plaque.
 */
const NAME_STRIP_BANDS: Record<string, { y0: number; y1: number }> = {
  unit: { y0: 0.56, y1: 0.63 },
  spell: { y0: 0.56, y1: 0.63 },
  gear: { y0: 0.56, y1: 0.63 },
  legend: { y0: 0.67, y1: 0.74 },
  rune: { y0: 0.67, y1: 0.74 },
  // Battlefields are landscape, so these are fractions of the SHORT axis.
  // Eyeballed, not scanner-measured, with the portrait bar's absolute
  // thickness rescaled to the landscape axis. Adjust by eye if the plaque
  // drifts out of the window.
  battlefield: { y0: 0.67, y1: 0.77 },
};

/**
 * @returns The name-bar window for a card type; unknown types get the
 * unit/spell/gear bar.
 */
export function nameStripBand(cardType: string): { y0: number; y1: number } {
  return NAME_STRIP_BANDS[cardType] ?? NAME_STRIP_BANDS.unit;
}

/**
 * Whether a card's art is landscape. Battlefield art is rotated, so its thumb
 * spans a portrait card's *height* instead of its width. Read off the full type
 * set, not the primary type, so a dual-typed battlefield still counts.
 * @returns True for landscape art.
 */
export function isLandscapeCard(card: Pick<DeckBuilderCard, "cardTypes">): boolean {
  return card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD);
}

/**
 * Resting window of a strip in a stacks-mode pile: the pile's "top" card is the
 * art anchor (its whole top half down through the name bar); every other card
 * shows the name bar alone.
 */
export type StackStripVariant = "top" | "middle";

/** The strip model shared by a pile's hit-testing and the strips it renders. */
export interface StackStripGeometry {
  /** Battlefield art is rotated, so its strip is a card's height wide. */
  isLandscape: boolean;
  /** The card type's name-bar window, as fractions of card height. */
  band: { y0: number; y1: number };
  /** Strip width, as a multiple of `--deck-card-w`. */
  widthRatio: number;
  /** Full card height, as a multiple of the strip's own width. */
  heightPerWidth: number;
  /** Full card height, as a multiple of `--deck-card-w`. */
  cardHeightRatio: number;
  /** Resting height, as a fraction of the full card height. */
  restFraction: number;
  /** Resting corner radius, as a CSS length. */
  restRadius: string;
}

/**
 * The layout model for one strip in a stacks-mode pile.
 *
 * Both the pile and the strips it renders need it, and they need the same
 * numbers: the pile hit-tests the pointer against the rows' heights (CSS
 * `:hover` misses rows while the pile animates under a slow cursor), while a
 * strip sizes itself from them. One helper so the two can't drift apart.
 *
 * `heightPerWidth` is stated against the strip's own width so a pile can go
 * straight from its measured pixel width to a row height, whatever the
 * orientation.
 *
 * @returns The strip's rest window, size ratios, and resting corner radius.
 */
export function stackStripGeometry(
  card: Pick<DeckBuilderCard, "cardType" | "cardTypes">,
  variant: StackStripVariant,
): StackStripGeometry {
  const isLandscape = isLandscapeCard(card);
  const band = nameStripBand(card.cardType);
  // A landscape strip spans a portrait card's height in width, so its own
  // height is exactly one --deck-card-w.
  const widthRatio = isLandscape ? 88 / 63 : 1;
  return {
    isLandscape,
    band,
    widthRatio,
    heightPerWidth: isLandscape ? 63 / 88 : CARD_HEIGHT_RATIO,
    cardHeightRatio: isLandscape ? 1 : CARD_HEIGHT_RATIO,
    restFraction: variant === "top" ? band.y1 : band.y1 - band.y0,
    restRadius: `calc(var(--deck-card-w) * ${widthRatio * STACK_STRIP_RADIUS_FRACTION})`,
  };
}

/**
 * Grid placement for the small-zone row, on the same column grid the cards use.
 * Legend and champion are one card wide. Runes claims whatever it takes to keep
 * its two cards side by side: from four columns up it shares row one (leaving
 * exactly one card each for legend and champion), below that it takes a row of
 * its own — at three columns that leaves one cell empty after champion, which
 * beats stacking the runes. Battlefields get a full-width band, since three
 * landscape cards never fit a narrow cell — except in stacks mode, where the
 * cascade is one landscape card (~1.4 columns) wide: with six or more columns
 * it joins row one after legend, champion, and a two-card runes cell.
 * @returns Per-zone `style` objects for the tiles.
 */
export function smallZoneGridStyles(
  columns: number,
  stackedBattlefield: boolean,
): Partial<Record<DeckZone, React.CSSProperties>> {
  if (stackedBattlefield && columns >= 6) {
    const battlefieldSpan = columns - 4;
    return {
      legend: { gridColumn: "span 1 / span 1" },
      champion: { gridColumn: "span 1 / span 1" },
      runes: { gridColumn: "span 2 / span 2" },
      battlefield: { gridColumn: `span ${battlefieldSpan} / span ${battlefieldSpan}` },
    };
  }
  const runeSpan = columns >= 4 ? columns - 2 : columns;
  return {
    legend: { gridColumn: "span 1 / span 1" },
    champion: { gridColumn: "span 1 / span 1" },
    runes: { gridColumn: `span ${runeSpan} / span ${runeSpan}` },
    battlefield: { gridColumn: "1 / -1" },
  };
}
