import type { CardType, DeckZone, SuperType } from "./types/enums.js";

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
  cardType: CardType,
  _superTypes: SuperType[],
  sourceSlot: SourceSlot,
): DeckZone {
  if (sourceSlot === "chosenChampion") {
    return "champion";
  }
  if (sourceSlot === "sideboard") {
    return "sideboard";
  }

  // mainDeck — infer from card type
  if (cardType === "Legend") {
    return "legend";
  }
  if (cardType === "Rune") {
    return "runes";
  }
  if (cardType === "Battlefield") {
    return "battlefield";
  }

  return "main";
}
