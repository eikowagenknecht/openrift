import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";

export interface PoolCard {
  key: string;
  cardId: string;
  cardName: string;
  preferredPrintingId: string | null;
}

export interface BenchState {
  hand: PoolCard[];
  library: PoolCard[];
  mulliganUsed: boolean;
  hasDrawn: boolean;
}

// The counter runs per card across pool entries: a card split over two
// pinned printings must not restart at 0 and hand two copies the same key.
export function buildBenchPool(cards: readonly DeckBuilderCard[]): PoolCard[] {
  const copySeq = new Map<string, number>();
  return cards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .flatMap((card) =>
      Array.from({ length: card.quantity }, () => {
        const index = copySeq.get(card.cardId) ?? 0;
        copySeq.set(card.cardId, index + 1);
        return {
          key: `${card.cardId}-${index}`,
          cardId: card.cardId,
          cardName: card.cardName,
          preferredPrintingId: card.preferredPrintingId,
        };
      }),
    );
}
