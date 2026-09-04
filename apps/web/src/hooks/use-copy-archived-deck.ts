import type { MetaDeckDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";

import { useCloneSharedDeck } from "@/hooks/use-decks";
import { useUserId } from "@/lib/auth-session";
import { useLocalDecksStore } from "@/stores/local-decks-store";

interface CopyArchivedDeckInput {
  token: string;
  deck: MetaDeckDetailResponse["deck"];
  cards: MetaDeckDetailResponse["cards"];
}

export interface CopyArchivedDeck {
  copy: (input: CopyArchivedDeckInput) => Promise<void>;
  isPending: boolean;
  isLoggedIn: boolean;
  label: string;
}

/**
 * Signed in duplicates the deck server-side, signed out builds the same list as
 * a browser-local deck. Which branch runs follows the deck importer: the
 * presence of a user id, not a session load state.
 */
export function useCopyArchivedDeck(): CopyArchivedDeck {
  const userId = useUserId();
  const isLoggedIn = userId !== null;
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();

  const copy = async ({ token, deck, cards }: CopyArchivedDeckInput) => {
    if (!isLoggedIn) {
      const store = useLocalDecksStore.getState();
      const localId = store.createDeck(deck.format, deck.name);
      // createDeck starts with formatConfig null, so a Custom-Region copy would lose its regions.
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
    copy,
    isPending: cloneMutation.isPending,
    isLoggedIn,
    label: isLoggedIn ? "Copy to my decks" : "Open in deck builder",
  };
}
