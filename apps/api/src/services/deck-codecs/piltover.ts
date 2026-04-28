import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import type { Card as PiltoverCard } from "@piltoverarchive/riftbound-deck-codes";

import type { DeckCodec, DeckCodecCard, EncodeResult } from "./types.js";

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
      if (card.zone === "overflow") {
        continue;
      }

      if (!card.shortCode) {
        warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
        continue;
      }

      if (card.zone === "champion") {
        chosenChampion = card.shortCode;
        // The Piltover format expects the chosen champion counted in mainDeck
        // (it's a marker, not an extra slot), so include 1 copy.
        mainDeckMap.set(card.shortCode, (mainDeckMap.get(card.shortCode) ?? 0) + 1);
        continue;
      }

      if (card.zone === "sideboard") {
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
