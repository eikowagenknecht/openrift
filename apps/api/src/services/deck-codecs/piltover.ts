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

// Count caps of the Piltover binary format. Its encoder buckets counts from
// the cap down to 1, so a count above the cap matches no bucket and the card
// would silently vanish from the code. Clamp to the cap and warn instead.
const MAIN_DECK_COUNT_CAP = 12;
const SIDEBOARD_COUNT_CAP = 3;

interface CountedCard {
  cardName: string;
  count: number;
}

/**
 * Clamps a card's count to the format cap, warning when copies are lost.
 * @returns The count to encode, at most the cap.
 */
function clampCount(card: CountedCard, cap: number, where: string, warnings: string[]): number {
  if (card.count <= cap) {
    return card.count;
  }
  warnings.push(
    `"${card.cardName}": deck codes allow at most ${cap} copies ${where}, exported ${cap} of ${card.count}`,
  );
  return cap;
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
    const mainDeckMap = new Map<string, CountedCard>();
    const sideboard: PiltoverCard[] = [];
    let chosenChampion: string | undefined;

    const addToMainDeck = (card: DeckCodecCard, count: number): void => {
      const entry = mainDeckMap.get(card.shortCode);
      if (entry) {
        entry.count += count;
      } else {
        mainDeckMap.set(card.shortCode, { cardName: card.cardName, count });
      }
    };

    for (const card of cards) {
      if (card.zone === WellKnown.deckZone.OVERFLOW) {
        continue;
      }

      if (!card.shortCode) {
        warnings.push(`Skipped "${card.cardName}": no canonical printing found`);
        continue;
      }

      if (card.zone === WellKnown.deckZone.CHAMPION) {
        chosenChampion = card.shortCode;
        // The Piltover format expects the chosen champion counted in mainDeck
        // (it's a marker, not an extra slot), so include 1 copy.
        addToMainDeck(card, 1);
        continue;
      }

      if (card.zone === WellKnown.deckZone.SIDEBOARD) {
        sideboard.push({
          cardCode: card.shortCode,
          count: clampCount(
            { cardName: card.cardName, count: card.quantity },
            SIDEBOARD_COUNT_CAP,
            "in the sideboard",
            warnings,
          ),
        });
      } else {
        // main, runes, legend, battlefield all go into mainDeck
        addToMainDeck(card, card.quantity);
      }
    }

    const mainDeck: PiltoverCard[] = [...mainDeckMap.entries()].map(([cardCode, entry]) => ({
      cardCode,
      count: clampCount(entry, MAIN_DECK_COUNT_CAP, "in the main deck", warnings),
    }));

    const code = getCodeFromDeck(mainDeck, sideboard, chosenChampion);
    return { code, warnings };
  },
};
