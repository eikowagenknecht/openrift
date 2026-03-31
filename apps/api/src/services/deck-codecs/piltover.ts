import { getCodeFromDeck, getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import type { Card as PiltoverCard } from "@piltoverarchive/riftbound-deck-codes";

import type { DeckCodec, DeckCodecCard, DecodeResult, EncodeResult } from "./types.js";

/**
 * Deck codec for Piltover Archive deck codes.
 *
 * @see https://github.com/Piltover-Archive/RiftboundDeckCodes
 */
export const piltoverCodec: DeckCodec = {
  formatId: "piltover",

  encode(cards: DeckCodecCard[]): EncodeResult {
    const warnings: string[] = [];
    const mainDeck: PiltoverCard[] = [];
    const sideboard: PiltoverCard[] = [];
    let chosenChampion: string | undefined;

    for (const card of cards) {
      // Skip overflow — not encodable
      if (card.zone === "overflow") {
        continue;
      }

      if (!card.shortCode) {
        warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
        continue;
      }

      if (card.zone === "champion") {
        chosenChampion = card.shortCode;
        continue;
      }

      const entry: PiltoverCard = { cardCode: card.shortCode, count: card.quantity };

      if (card.zone === "sideboard") {
        sideboard.push(entry);
      } else {
        // main, runes, legend, battlefield all go into mainDeck
        mainDeck.push(entry);
      }
    }

    const code = getCodeFromDeck(mainDeck, sideboard, chosenChampion);
    return { code, warnings };
  },

  decode(code: string): DecodeResult {
    const warnings: string[] = [];

    const decoded = getDeckFromCode(code);

    const cards: DecodeResult["cards"] = [];

    for (const card of decoded.mainDeck) {
      cards.push({ cardCode: card.cardCode, count: card.count, sourceSlot: "mainDeck" });
    }

    for (const card of decoded.sideboard) {
      cards.push({ cardCode: card.cardCode, count: card.count, sourceSlot: "sideboard" });
    }

    if (decoded.chosenChampion) {
      cards.push({ cardCode: decoded.chosenChampion, count: 1, sourceSlot: "chosenChampion" });
    }

    return { cards, warnings };
  },
};
