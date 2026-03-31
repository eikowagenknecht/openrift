import type { DeckFormat, DeckZone } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const decksQueryOptions = queryOptions({
  queryKey: queryKeys.decks.all,
  queryFn: async () => {
    const res = await client.api.v1.decks.$get({ query: {} });
    assertOk(res);
    return await res.json();
  },
  select: (data) => data.items,
});

export function deckDetailQueryOptions(deckId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.detail(deckId),
    queryFn: async () => {
      const res = await client.api.v1.decks[":id"].$get({ param: { id: deckId } });
      assertOk(res);
      return await res.json();
    },
  });
}

export function useDecks() {
  return useSuspenseQuery(decksQueryOptions);
}

export function useDeckDetail(deckId: string) {
  return useSuspenseQuery(deckDetailQueryOptions(deckId));
}

export function useCreateDeck() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isWanted?: boolean;
      isPublic?: boolean;
    }) => {
      const res = await client.api.v1.decks.$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.decks.all],
  });
}

export function useDeleteDeck() {
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: async (deckId) => {
      const res = await client.api.v1.decks[":id"].$delete({ param: { id: deckId } });
      assertOk(res);
    },
    invalidates: [queryKeys.decks.all],
  });
}

export function useSaveDeckCards() {
  return useMutationWithInvalidation<
    unknown,
    { deckId: string; cards: { cardId: string; zone: DeckZone; quantity: number }[] }
  >({
    mutationFn: async ({ deckId, cards }) => {
      const res = await client.api.v1.decks[":id"].cards.$put({
        param: { id: deckId },
        json: { cards },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.decks.all],
  });
}

export function useCloneDeck() {
  return useMutationWithInvalidation({
    mutationFn: async (deckId: string) => {
      const res = await client.api.v1.decks[":id"].clone.$post({ param: { id: deckId } });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.decks.all],
  });
}
