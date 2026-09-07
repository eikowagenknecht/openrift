import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

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

export const SMALL_ZONES: DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
];

// Must stay in step with the gap-1.5 class between thumbs; the card width is derived from it.
export const DECK_GRID_GAP = 6;

// Small enough that a phone always gets two cards per row before the SSR paint measures.
export const UNMEASURED_CARD_WIDTH = "min(11rem, 40vw)";

/** Card height as a multiple of its width — the stacks math needs the number. */
export const CARD_HEIGHT_RATIO = 88 / 63;

/** Vertical gap between stack strips; must match the pile's `gap-1` class. */
export const STACK_GAP_PX = 4;

// Matches CARD_BORDER_RADIUS (5% of card width), expressed against width so it
// doesn't collapse on a ~20px-tall slice.
const STACK_STRIP_RADIUS_FRACTION = 0.05;

// Tighter than NAME_BANDS in packages/shared/src/scan/disambiguate.ts: that
// scanner data carries deliberate slack for its shift search.
const DEFAULT_NAME_STRIP_BAND = { y0: 0.56, y1: 0.63 };

const NAME_STRIP_BANDS: Record<string, { y0: number; y1: number }> = {
  unit: DEFAULT_NAME_STRIP_BAND,
  spell: { y0: 0.56, y1: 0.63 },
  gear: { y0: 0.56, y1: 0.63 },
  legend: { y0: 0.67, y1: 0.74 },
  rune: { y0: 0.67, y1: 0.74 },
  // Fractions of the SHORT axis (battlefields are landscape); eyeballed, not scanner-measured.
  battlefield: { y0: 0.67, y1: 0.77 },
};

export function nameStripBand(cardType: string): { y0: number; y1: number } {
  return NAME_STRIP_BANDS[cardType] ?? DEFAULT_NAME_STRIP_BAND;
}

// Reads the full type set, not the primary type, so a dual-typed battlefield still counts.
export function isLandscapeCard(card: Pick<DeckBuilderCard, "cardTypes">): boolean {
  return card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD);
}

// "top" is the art anchor down through the name bar; "middle" shows the name bar alone.
export type StackStripVariant = "top" | "middle";

/** The strip model shared by a pile's hit-testing and the strips it renders. */
export interface StackStripGeometry {
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

// Shared by the pile's hit-testing and the strips it renders, so the two numbers can't drift apart.
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
