import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";

import type { DeckZone } from "./types/enums.js";
import { WellKnown } from "./well-known.js";
import type { SourceSlot } from "./zone-inference.js";

export interface DeckImportEntry {
  shortCode?: string;
  cardName?: string;
  quantity: number;
  sourceSlot: SourceSlot;
  explicitZone?: DeckZone;
  rawFields: Record<string, string>;
}

export interface DeckCodeParseResult {
  entries: DeckImportEntry[];
  warnings: string[];
}

/**
 * Retries with the uppercased input when the raw string fails: codes are
 * base32 and users occasionally paste them lowercased.
 */
function decodeDeckCodeFlexible(code: string): ReturnType<typeof getDeckFromCode> | null {
  try {
    return getDeckFromCode(code);
  } catch {
    const upper = code.toUpperCase();
    if (upper === code) {
      return null;
    }
    try {
      return getDeckFromCode(upper);
    } catch {
      return null;
    }
  }
}

/**
 * Splits the chosen champion out of the main deck so it isn't double-counted.
 */
export function parsePiltoverDeckCode(code: string): DeckCodeParseResult {
  const warnings: string[] = [];

  const decoded = decodeDeckCodeFlexible(code);
  if (!decoded) {
    return { entries: [], warnings: ["Invalid Piltover Archive deck code."] };
  }
  const entries: DeckImportEntry[] = [];

  // The library can return the same card multiple times in mainDeck with
  // different counts; consolidate by card code before subtracting the champion.
  const mainDeckTotals = new Map<string, number>();
  for (const card of decoded.mainDeck) {
    mainDeckTotals.set(card.cardCode, (mainDeckTotals.get(card.cardCode) ?? 0) + card.count);
  }

  for (const [cardCode, total] of mainDeckTotals) {
    const quantity = decoded.chosenChampion === cardCode ? total - 1 : total;
    if (quantity > 0) {
      entries.push({
        shortCode: cardCode,
        quantity,
        sourceSlot: "mainDeck",
        rawFields: { "Source Code": cardCode, Slot: "Main Deck" },
      });
    }
  }

  for (const card of decoded.sideboard) {
    entries.push({
      shortCode: card.cardCode,
      quantity: card.count,
      sourceSlot: "sideboard",
      rawFields: { "Source Code": card.cardCode, Slot: "Sideboard" },
    });
  }

  if (decoded.chosenChampion) {
    entries.push({
      shortCode: decoded.chosenChampion,
      quantity: 1,
      sourceSlot: "chosenChampion",
      explicitZone: WellKnown.deckZone.CHAMPION,
      rawFields: { "Source Code": decoded.chosenChampion, Slot: "Chosen Champion" },
    });
  }

  return { entries, warnings };
}

/**
 * Pre-filter only; `decodeDeckCodeFlexible` has final say.
 * Lowercase is allowed: it retries uppercased.
 */
const DECK_CODE_CANDIDATE = /^[A-Za-z2-7]{12,}={0,7}$/u;

export function isDeckCode(candidate: string): boolean {
  return DECK_CODE_CANDIDATE.test(candidate) && decodeDeckCodeFlexible(candidate) !== null;
}
