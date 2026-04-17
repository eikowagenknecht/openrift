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
