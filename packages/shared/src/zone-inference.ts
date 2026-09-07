import type { CardType, DeckZone, SuperType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

export type SourceSlot = "mainDeck" | "sideboard" | "chosenChampion";

/**
 * Reconstructs the deck zone a card belongs to during import, when the source
 * format (e.g. a Piltover Archive deck code) doesn't encode zones natively.
 */
export function inferZone(
  cardTypes: readonly CardType[],
  _superTypes: SuperType[],
  sourceSlot: SourceSlot,
): DeckZone {
  if (sourceSlot === "chosenChampion") {
    return WellKnown.deckZone.CHAMPION;
  }
  if (sourceSlot === "sideboard") {
    return WellKnown.deckZone.SIDEBOARD;
  }

  if (cardTypes.includes(WellKnown.cardType.LEGEND)) {
    return WellKnown.deckZone.LEGEND;
  }
  if (cardTypes.includes(WellKnown.cardType.RUNE)) {
    return WellKnown.deckZone.RUNES;
  }
  if (cardTypes.includes(WellKnown.cardType.BATTLEFIELD)) {
    return WellKnown.deckZone.BATTLEFIELD;
  }

  return WellKnown.deckZone.MAIN;
}

const ZONE_TO_SOURCE_SLOT: Record<DeckZone, SourceSlot> = {
  main: "mainDeck",
  legend: "mainDeck",
  champion: "chosenChampion",
  runes: "mainDeck",
  battlefield: "mainDeck",
  sideboard: "sideboard",
  overflow: "mainDeck",
};

/**
 * Inverse of {@link inferZone}, for import paths that already know the zone
 * but still hand entries to the shared slot-driven pipeline.
 */
export function sourceSlotForZone(zone: DeckZone): SourceSlot {
  return ZONE_TO_SOURCE_SLOT[zone];
}
