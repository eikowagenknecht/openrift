import type { DeckFormat, DeckZone } from "@openrift/shared";
import { SIDEBOARD_MAXIMUM, WellKnown } from "@openrift/shared";

export {
  REQUIRED_ZONES,
  ZONE_LABELS,
  requiredZoneProgress,
  zoneExpected,
  zoneLabel,
} from "@openrift/shared";

/** Prefer `zoneEmptyHint` — this misses the Custom-Region battlefield override. */
export const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend",
  champion: "Pick a matching Chosen Champion",
  runes: "Auto-fills from your Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Add cards from the browser",
  sideboard: `Add up to ${SIDEBOARD_MAXIMUM} sideboard cards`,
  overflow: "Stash extra cards here while you decide",
};

export function zoneEmptyHint(zone: DeckZone, format: DeckFormat): string {
  if (zone === WellKnown.deckZone.BATTLEFIELD && format === WellKnown.deckFormat.CUSTOM_REGION) {
    return "Choose a Battlefield card";
  }
  return ZONE_EMPTY_HINTS[zone];
}

const ZONE_EMPTY_READ_ONLY: Record<DeckZone, string> = {
  legend: "No Legend picked",
  champion: "No Chosen Champion picked",
  runes: "No Runes",
  battlefield: "No Battlefields",
  main: "No cards",
  sideboard: "No sideboard cards",
  overflow: "No cards",
};

export function zoneEmptyReadOnlyLabel(zone: DeckZone): string {
  return ZONE_EMPTY_READ_ONLY[zone];
}
