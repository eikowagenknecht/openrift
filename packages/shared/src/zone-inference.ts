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

/** The source slot each zone maps back to, used when a zone is already known. */
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
 * The source slot a card in this zone would have occupied in an external
 * format. The inverse of {@link inferZone}, for import paths that already know
 * the zone (an explicit text-format header, a resolved shared deck) but still
 * hand entries to the shared slot-driven pipeline.
 * @returns The matching source slot.
 */
export function sourceSlotForZone(zone: DeckZone): SourceSlot {
  return ZONE_TO_SOURCE_SLOT[zone];
}
