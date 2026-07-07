import type { CardType, DeckZone, SuperType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

/** The source slot a card occupied in the external format being imported. */
export type SourceSlot = "mainDeck" | "sideboard" | "chosenChampion";

/**
 * Infers which OpenRift deck zone a card belongs to based on its game type and
 * where it came from in the source format.
 *
 * Used during import to reconstruct zone assignments that lossy formats
 * (like Piltover Archive deck codes) don't encode natively.
 *
 * @returns The inferred DeckZone.
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

  // mainDeck — infer from the card's type set (ADR-037: any type qualifies)
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
