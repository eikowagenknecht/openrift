import type { DeckZone } from "@openrift/shared";

/**
 * Human-friendly zone labels, shared by the deck sidebar, overview dashboard,
 * and top bar. Slightly more descriptive than the raw DB labels (e.g.
 * "Chosen Champion" vs "Champion").
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
 * Expected card count per zone for a complete, legal deck. Drives the zone
 * completion hints and the Cards KPI. Zones not listed have no fixed target.
 */
export const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

/** Placeholder hint shown in an empty zone, prompting the next action. */
export const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend",
  champion: "Pick a matching Chosen Champion",
  runes: "Auto-fills from your Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Add cards from the browser",
  sideboard: "Add up to 8 sideboard cards",
  overflow: "Stash extra cards here while you decide",
};
