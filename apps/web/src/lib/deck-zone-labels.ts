import type { DeckFormat, DeckZone } from "@openrift/shared";
import { SIDEBOARD_MAXIMUM, WellKnown } from "@openrift/shared";

/**
 * The zone label and count tables live in `@openrift/shared` — the TTS codec
 * derives its positional boundaries from the same counts, so writer and reader
 * cannot drift, and the deck-list endpoint reports the same completion figure
 * the deck page shows. Re-exported here because this is where the app's deck
 * surfaces already import them from.
 */
export {
  REQUIRED_ZONES,
  ZONE_LABELS,
  requiredZoneProgress,
  zoneExpected,
  zoneLabel,
} from "@openrift/shared";

/**
 * Placeholder hint shown in an empty zone, prompting the next action.
 * Prefer `zoneEmptyHint` — it applies the format-specific overrides.
 */
export const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend",
  champion: "Pick a matching Chosen Champion",
  runes: "Auto-fills from your Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Add cards from the browser",
  sideboard: `Add up to ${SIDEBOARD_MAXIMUM} sideboard cards`,
  overflow: "Stash extra cards here while you decide",
};

/**
 * Placeholder hint for an empty zone in the given format. Custom-Region asks
 * for a single battlefield instead of three.
 * @returns The hint text for the zone.
 */
export function zoneEmptyHint(zone: DeckZone, format: DeckFormat): string {
  if (zone === WellKnown.deckZone.BATTLEFIELD && format === WellKnown.deckFormat.CUSTOM_REGION) {
    return "Choose a Battlefield card";
  }
  return ZONE_EMPTY_HINTS[zone];
}

/**
 * Placeholder for an empty zone on read-only views (the public share page).
 * The owner's hints are calls to action ("Choose a Legend"), which read wrong
 * for a viewer who can't edit — this states what's missing instead.
 */
const ZONE_EMPTY_READ_ONLY: Record<DeckZone, string> = {
  legend: "No Legend picked",
  champion: "No Chosen Champion picked",
  runes: "No Runes",
  battlefield: "No Battlefields",
  main: "No cards",
  sideboard: "No sideboard cards",
  overflow: "No cards",
};

/**
 * Descriptive empty-zone text for read-only deck views.
 * @returns The read-only placeholder text for the zone.
 */
export function zoneEmptyReadOnlyLabel(zone: DeckZone): string {
  return ZONE_EMPTY_READ_ONLY[zone];
}
