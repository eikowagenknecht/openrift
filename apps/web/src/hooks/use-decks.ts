import type {
  DeckCardResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckListResponse,
  DeckResponse,
  DeckZone,
} from "@openrift/shared";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<DeckListResponse> => {
    const res = await fetch(`${API_URL}/api/v1/decks`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Decks fetch failed: ${res.status}`);
    }
    return res.json() as Promise<DeckListResponse>;
  });

const fetchDeckDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }): Promise<DeckDetailResponse> => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Deck detail fetch failed: ${res.status}`);
    }
    return res.json() as Promise<DeckDetailResponse>;
  });

export const decksQueryOptions = queryOptions({
  queryKey: queryKeys.decks.all,
  queryFn: () => fetchDecks(),
  select: (data: DeckListResponse) => data.items,
});

export function deckDetailQueryOptions(deckId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.detail(deckId),
    queryFn: () => fetchDeckDetail({ data: deckId }),
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deckId,
      cards,
    }: {
      deckId: string;
      cards: { cardId: string; zone: DeckZone; quantity: number }[];
    }): Promise<{ cards: DeckCardResponse[] }> => {
      const res = await client.api.v1.decks[":id"].cards.$put({
        param: { id: deckId },
        json: { cards },
      });
      assertOk(res);
      return (await res.json()) as { cards: DeckCardResponse[] };
    },
    onSuccess: (data, variables) => {
      // Update deck detail cache with the returned cards
      queryClient.setQueryData<DeckDetailResponse>(
        queryKeys.decks.detail(variables.deckId),
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, cards: data.cards };
        },
      );

      // Invalidate the deck list (for aggregate stats like type counts, domain distribution)
      // but don't refetch the detail since we just updated it
      void queryClient.invalidateQueries({
        queryKey: queryKeys.decks.all,
        exact: true,
      });
    },
  });
}

export function useUpdateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deckId,
      ...fields
    }: {
      deckId: string;
      name?: string;
      format?: DeckFormat;
    }): Promise<DeckResponse> => {
      const res = await client.api.v1.decks[":id"].$patch({
        param: { id: deckId },
        json: fields,
      });
      assertOk(res);
      return (await res.json()) as DeckResponse;
    },
    onSuccess: (data, variables) => {
      // Update deck detail cache with the returned metadata
      queryClient.setQueryData<DeckDetailResponse>(
        queryKeys.decks.detail(variables.deckId),
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, deck: data };
        },
      );

      // Update the deck list entry if it exists (spread to preserve summary-only fields)
      queryClient.setQueryData<DeckListResponse>(queryKeys.decks.all, (old) => {
        if (!old) {
          return old;
        }
        return {
          items: old.items.map((item) =>
            item.deck.id === variables.deckId ? { ...item, deck: { ...item.deck, ...data } } : item,
          ),
        };
      });
    },
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

type ExportFormat = "piltover" | "text" | "tts";

export function useExportDeck() {
  return useMutationWithInvalidation<DeckExportResponse, { deckId: string; format?: ExportFormat }>(
    {
      mutationFn: async ({ deckId, format }) => {
        const res = await client.api.v1.decks[":id"].export.$get({
          param: { id: deckId },
          query: { format },
        });
        assertOk(res);
        return await res.json();
      },
      invalidates: [],
    },
  );
}
