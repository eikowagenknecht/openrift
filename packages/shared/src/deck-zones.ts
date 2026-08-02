import { formatHasSideboard } from "./deck-rules.js";
import type { DeckFormat, DeckZone } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

/**
 * Human-friendly zone labels, shared by the deck sidebar, overview dashboard,
 * top bar, and the import review step. Slightly more descriptive than the raw
 * DB labels (e.g. "Chosen Champion" vs "Champion").
 *
 * These are display labels. The zone *headers* written into and read back from
 * the text interchange format are a separate vocabulary owned by
 * `deck-codecs/text.ts`.
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

/**
 * Display label for a zone, falling back to the raw value for unrecognized
 * zones. Use this when the zone is typed loosely as `string` (e.g. the deck
 * ownership hook) so callers don't re-declare their own label map.
 * @returns The human-friendly zone label, or `zone` itself when unknown.
 */
export function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone as DeckZone] ?? zone;
}

/**
 * Expected card count per zone for a complete, legal constructed deck. Zones
 * not listed have no fixed target. Prefer `zoneExpected` — it applies the
 * format-specific overrides (Custom-Region battlefields, sideboard-less
 * formats) on top of these baselines.
 */
export const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

/**
 * Expected card count for a zone in a complete, legal deck of the given
 * format. Custom-Region plays a single battlefield instead of three, and
 * formats without a sideboard have no target there. Drives the zone
 * completion hints, the Cards KPI, and the TTS decoder's zone boundaries.
 * @returns The target count, or undefined when the zone has no fixed target.
 */
export function zoneExpected(zone: DeckZone, format: DeckFormat): number | undefined {
  if (zone === WellKnown.deckZone.BATTLEFIELD && format === WellKnown.deckFormat.CUSTOM_REGION) {
    return 1;
  }
  if (zone === WellKnown.deckZone.SIDEBOARD && !formatHasSideboard(format)) {
    return undefined;
  }
  return ZONE_EXPECTED[zone];
}
