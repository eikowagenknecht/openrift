import { formatHasSideboard } from "./deck-rules.js";
import type { DeckFormat, DeckZone } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

/**
 * Display labels. The zone headers in the text interchange format are a
 * separate vocabulary owned by `deck-codecs/text.ts`.
 */
export const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "Runes",
  battlefield: "Battlefields",
  main: "Main Deck",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

export function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone as DeckZone] ?? zone;
}

/** Prefer `zoneExpected`; this omits the per-format overrides. */
export const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

export function zoneExpected(zone: DeckZone, format: DeckFormat): number | undefined {
  if (zone === WellKnown.deckZone.BATTLEFIELD && format === WellKnown.deckFormat.CUSTOM_REGION) {
    return 1;
  }
  if (zone === WellKnown.deckZone.SIDEBOARD && !formatHasSideboard(format)) {
    return undefined;
  }
  return ZONE_EXPECTED[zone];
}

export function isCountedZone(zone: string): boolean {
  return zone !== WellKnown.deckZone.OVERFLOW;
}

export const REQUIRED_ZONES: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
];

/**
 * Lives here so the deck-list endpoint and the deck page compute the same
 * figure.
 */
export function requiredZoneProgress(
  cards: readonly { zone: DeckZone; quantity: number }[],
  format: DeckFormat,
): { progress: number; total: number } {
  const progress = cards
    .filter((card) => REQUIRED_ZONES.includes(card.zone))
    .reduce((sum, card) => sum + card.quantity, 0);
  const total = REQUIRED_ZONES.reduce((sum, zone) => sum + (zoneExpected(zone, format) ?? 0), 0);
  return { progress, total };
}
