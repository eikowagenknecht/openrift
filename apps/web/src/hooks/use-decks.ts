import type {
  DeckCardResponse,
  DeckCloneResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckListResponse,
  DeckResponse,
  DeckShareResponse,
  DeckZone,
  PublicDeckDetailResponse,
} from "@openrift/shared";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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

const createDeckFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isWanted?: boolean;
      isPublic?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/decks`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckResponse>;
  });

export function useCreateDeck() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isWanted?: boolean;
      isPublic?: boolean;
    }) => createDeckFn({ data: body }),
    invalidates: [queryKeys.decks.all],
  });
}

const deleteDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete deck failed: ${res.status}`);
    }
  });

export function useDeleteDeck() {
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (deckId) => deleteDeckFn({ data: deckId }),
    invalidates: [queryKeys.decks.all],
  });
}

export const saveDeckCardsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      deckId: string;
      cards: {
        cardId: string;
        zone: DeckZone;
        quantity: number;
        preferredPrintingId: string | null;
      }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(data.deckId)}/cards`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ cards: data.cards }),
    });
    if (!res.ok) {
      throw new Error(`Save deck cards failed: ${res.status}`);
    }
    return res.json() as Promise<{ cards: DeckCardResponse[] }>;
  });

export function useSaveDeckCards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deckId,
      cards,
    }: {
      deckId: string;
      cards: {
        cardId: string;
        zone: DeckZone;
        quantity: number;
        preferredPrintingId: string | null;
      }[];
    }): Promise<{ cards: DeckCardResponse[] }> => saveDeckCardsFn({ data: { deckId, cards } }),
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

const updateDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deckId: string; name?: string; format?: DeckFormat }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { deckId, ...fields } = data;
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      throw new Error(`Update deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckResponse>;
  });

export function useUpdateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deckId,
      ...fields
    }: {
      deckId: string;
      name?: string;
      format?: DeckFormat;
    }): Promise<DeckResponse> => updateDeckFn({ data: { deckId, ...fields } }),
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

const cloneDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}/clone`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Clone deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckResponse>;
  });

export function useCloneDeck() {
  return useMutationWithInvalidation({
    mutationFn: (deckId: string) => cloneDeckFn({ data: deckId }),
    invalidates: [queryKeys.decks.all],
  });
}

type ExportFormat = "piltover" | "text" | "tts";

const exportDeckFn = createServerFn({ method: "GET" })
  .inputValidator((input: { deckId: string; format?: ExportFormat }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const params = new URLSearchParams();
    if (data.format) {
      params.set("format", data.format);
    }
    const query = params.toString();
    const url = `${API_URL}/api/v1/decks/${encodeURIComponent(data.deckId)}/export${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Export deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckExportResponse>;
  });

export function useExportDeck() {
  return useMutationWithInvalidation<DeckExportResponse, { deckId: string; format?: ExportFormat }>(
    {
      mutationFn: ({ deckId, format }) => exportDeckFn({ data: { deckId, format } }),
      invalidates: [],
    },
  );
}

// ── Deck sharing ────────────────────────────────────────────────────────────

const shareDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }): Promise<DeckShareResponse> => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}/share`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Share deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckShareResponse>;
  });

export function useShareDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) => shareDeckFn({ data: deckId }),
    onSuccess: (data, deckId) => {
      queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(deckId), (old) =>
        old
          ? { ...old, deck: { ...old.deck, isPublic: data.isPublic, shareToken: data.shareToken } }
          : old,
      );
    },
  });
}

const unshareDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    const res = await fetch(`${API_URL}/api/v1/decks/${encodeURIComponent(deckId)}/share`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Unshare deck failed: ${res.status}`);
    }
  });

export function useUnshareDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) => unshareDeckFn({ data: deckId }),
    onSuccess: (_, deckId) => {
      queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(deckId), (old) =>
        old ? { ...old, deck: { ...old.deck, isPublic: false, shareToken: null } } : old,
      );
    },
  });
}

const fetchPublicDeckFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicDeckDetailResponse> => {
    const res = await fetch(`${API_URL}/api/v1/decks/share/${encodeURIComponent(token)}`);
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    if (!res.ok) {
      throw new Error(`Public deck fetch failed: ${res.status}`);
    }
    return res.json() as Promise<PublicDeckDetailResponse>;
  });

export function publicDeckQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.decks.publicByToken(token),
    queryFn: () => fetchPublicDeckFn({ data: token }),
  });
}

export function usePublicDeck(token: string) {
  return useSuspenseQuery(publicDeckQueryOptions(token));
}

const cloneSharedDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: token }): Promise<DeckCloneResponse> => {
    const res = await fetch(`${API_URL}/api/v1/decks/share/${encodeURIComponent(token)}/clone`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Clone shared deck failed: ${res.status}`);
    }
    return res.json() as Promise<DeckCloneResponse>;
  });

export function useCloneSharedDeck() {
  return useMutationWithInvalidation<DeckCloneResponse, string>({
    mutationFn: (token) => cloneSharedDeckFn({ data: token }),
    invalidates: [queryKeys.decks.all],
  });
}
