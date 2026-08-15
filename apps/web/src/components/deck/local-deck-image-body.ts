import type { DeckFormat } from "@openrift/shared";

import { useDeckCards } from "@/hooks/use-deck-builder";
import type { EncodeDeckCardInput } from "@/hooks/use-decks";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

/**
 * Payload the from-cards deck-image renderer takes for a browser-local deck
 * (ADR-035), which has no server row to resolve by id. The server enriches
 * names, art, and energy from the posted card ids.
 */
export interface LocalDeckImageBody {
  deckName: string;
  format: DeckFormat | undefined;
  ownerName: string;
  cards: EncodeDeckCardInput[];
}

/**
 * Assembles the from-cards image payload from the pieces the caller holds.
 * @returns The request body for the from-cards deck image route.
 */
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
 * Builds the from-cards image payload for a browser-local deck, reading the
 * format from the local store and the owner name from the session. Both the
 * share dialog's image download and the print dialog's deck sheet render a
 * local deck this way, so they share one builder.
 *
 * `cards` covers the deck-list menus, where the draft collection isn't
 * hydrated; otherwise the live editor draft is used.
 *
 * @returns A function producing the current request body.
 */
export function useLocalDeckImageBody(
  deckId: string,
  deckName: string | undefined,
  cards?: DeckBuilderCard[],
): () => LocalDeckImageBody {
  const { data: session } = useSession();
  // Only a local deck without passed-in cards reads the live draft. Anywhere
  // else this would subscribe a draft collection whose rows are never used —
  // once per deck row in the deck list.
  const needsLiveCards = cards === undefined && isLocalDeckId(deckId);
  const liveCards = useDeckCards(needsLiveCards ? deckId : "");
  const format = useLocalDecksStore((state) =>
    isLocalDeckId(deckId) ? state.decks[deckId]?.format : undefined,
  );

  return () => buildLocalDeckImageBody(deckName, format, session?.user?.name, cards ?? liveCards);
}
