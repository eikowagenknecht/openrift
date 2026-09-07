import type { DeckFormat } from "@openrift/shared";

import { useDeckCards } from "@/hooks/use-deck-builder";
import type { EncodeDeckCardInput } from "@/hooks/use-decks";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

/**
 * Payload the from-cards deck-image renderer takes for a browser-local deck,
 * which has no server row to resolve by id.
 */
export interface LocalDeckImageBody {
  deckName: string;
  format: DeckFormat | undefined;
  ownerName: string;
  cards: EncodeDeckCardInput[];
}

export function buildLocalDeckImageBody(
  deckName: string | undefined,
  format: DeckFormat | undefined,
  ownerName: string | undefined,
  cards: DeckBuilderCard[],
): LocalDeckImageBody {
  return {
    deckName: deckName ?? "",
    format,
    ownerName: ownerName ?? "",
    cards: toEncodeDeckCards(cards),
  };
}

/**
 * `cards` covers the deck-list menus, where the draft collection isn't
 * hydrated; otherwise the live editor draft is used.
 */
export function useLocalDeckImageBody(
  deckId: string,
  deckName: string | undefined,
  cards?: DeckBuilderCard[],
): () => LocalDeckImageBody {
  const { data: session } = useSession();
  // Only reads the live draft when needed; otherwise this would subscribe a
  // draft collection whose rows go unused, once per deck row in the list.
  const needsLiveCards = cards === undefined && isLocalDeckId(deckId);
  const liveCards = useDeckCards(needsLiveCards ? deckId : "");
  const format = useLocalDecksStore((state) =>
    isLocalDeckId(deckId) ? state.decks[deckId]?.format : undefined,
  );

  return () => buildLocalDeckImageBody(deckName, format, session?.user?.name, cards ?? liveCards);
}
