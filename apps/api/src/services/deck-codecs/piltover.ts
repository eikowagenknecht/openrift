import { WellKnown } from "@openrift/shared";
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import type { Card as PiltoverCard } from "@piltoverarchive/riftbound-deck-codes";

import type { DeckCodec, DeckCodecCard, EncodeResult } from "./types.js";

// Probe results per short code. The candidate space is the card catalog, so
// this stays small; probing costs a one-card encode.
const encodableCache = new Map<string, boolean>();

/**
 * Whether the Piltover library can encode this short code. The library throws
 * for sets and variants missing from its hardcoded mappings (Founders and
 * token printings today; new main sets until the library adds them), which
 * would otherwise abort the whole deck encode. Probing with a one-card deck
 * keeps this independent of the library's internals.
 * @returns True when the code can be encoded.
 */
export function isPiltoverEncodable(shortCode: string): boolean {
  const cached = encodableCache.get(shortCode);
  if (cached !== undefined) {
    return cached;
  }
  let encodable = true;
  try {
    getCodeFromDeck([{ cardCode: shortCode, count: 1 }], []);
  } catch {
    encodable = false;
  }
  encodableCache.set(shortCode, encodable);
  return encodable;
}

/**
 * Deck codec for Piltover Archive deck codes.
 *
 * @see https://github.com/Piltover-Archive/RiftboundDeckCodes
 */
export const piltoverCodec: DeckCodec = {
  formatId: "piltover",

  encode(cards: DeckCodecCard[]): EncodeResult {
    const warnings: string[] = [];
    // Accumulate mainDeck counts by shortCode so the champion copy is merged
    // with any existing main-zone copies into a single entry.
    const mainDeckMap = new Map<string, number>();
    const sideboard: PiltoverCard[] = [];
    let chosenChampion: string | undefined;

    for (const card of cards) {
      if (card.zone === WellKnown.deckZone.OVERFLOW) {
        continue;
      }

      if (!card.shortCode) {
        warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
        continue;
      }

      if (card.zone === WellKnown.deckZone.CHAMPION) {
        chosenChampion = card.shortCode;
        // The Piltover format expects the chosen champion counted in mainDeck
        // (it's a marker, not an extra slot), so include 1 copy.
        mainDeckMap.set(card.shortCode, (mainDeckMap.get(card.shortCode) ?? 0) + 1);
        continue;
      }

      if (card.zone === WellKnown.deckZone.SIDEBOARD) {
        sideboard.push({ cardCode: card.shortCode, count: card.quantity });
      } else {
        // main, runes, legend, battlefield all go into mainDeck
        mainDeckMap.set(card.shortCode, (mainDeckMap.get(card.shortCode) ?? 0) + card.quantity);
      }
    }

    const mainDeck: PiltoverCard[] = [...mainDeckMap.entries()].map(([cardCode, count]) => ({
      cardCode,
      count,
    }));

    const code = getCodeFromDeck(mainDeck, sideboard, chosenChampion);
    return { code, warnings };
  },
};
