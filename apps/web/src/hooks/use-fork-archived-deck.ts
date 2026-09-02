import type { MetaDeckDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";

import { useCloneSharedDeck } from "@/hooks/use-decks";
import { useUserId } from "@/lib/auth-session";
import { useLocalDecksStore } from "@/stores/local-decks-store";

interface ForkArchivedDeckInput {
  token: string;
  deck: MetaDeckDetailResponse["deck"];
  cards: MetaDeckDetailResponse["cards"];
}

export interface ForkArchivedDeck {
  fork: (input: ForkArchivedDeckInput) => Promise<void>;
  isPending: boolean;
  isLoggedIn: boolean;
  label: string;
}

/**
 * Signed in duplicates the deck server-side, signed out builds the same list as
 * a browser-local deck. Which branch runs follows the deck importer: the
 * presence of a user id, not a session load state.
 */
export function useForkArchivedDeck(): ForkArchivedDeck {
  const userId = useUserId();
  const isLoggedIn = userId !== null;
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();

  const fork = async ({ token, deck, cards }: ForkArchivedDeckInput) => {
    if (!isLoggedIn) {
      const store = useLocalDecksStore.getState();
      const localId = store.createDeck(deck.format, deck.name);
      // createDeck starts with formatConfig null, so a Custom-Region fork would lose its regions.
      store.updateDeck(localId, {
        formatConfig: deck.formatConfig,
        links: deck.links,
      });
      store.setCards(
        localId,
        cards.map((card) => ({
          zone: card.zone,
          cardId: card.cardId,
          quantity: card.quantity,
          preferredPrintingId: card.preferredPrintingId,
        })),
      );
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
      return;
    }
    try {
      const result = await cloneMutation.mutateAsync(token);
      void navigate({ to: "/decks/$deckId", params: { deckId: result.deckId } });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  return {
    fork,
    isPending: cloneMutation.isPending,
    isLoggedIn,
    label: isLoggedIn ? "Fork to my decks" : "Open in deck builder",
  };
}
