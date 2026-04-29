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

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<DeckListResponse> =>
      fetchApiJson<DeckListResponse>({
        errorTitle: "Couldn't load decks",
        cookie: context.cookie,
        path: "/api/v1/decks?includeArchived=true",
      }),
  );

const fetchDeckDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: deckId }): Promise<DeckDetailResponse> =>
      fetchApiJson<DeckDetailResponse>({
        errorTitle: "Couldn't load deck",
        cookie: context.cookie,
        path: `/api/v1/decks/${encodeURIComponent(deckId)}`,
      }),
  );

export function decksQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.all(userId),
    queryFn: () => fetchDecks(),
    select: (data: DeckListResponse) => data.items,
  });
}

export function deckDetailQueryOptions(userId: string, deckId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.detail(userId, deckId),
    queryFn: () => fetchDeckDetail({ data: deckId }),
  });
}

export function useDecks() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(decksQueryOptions(userId));
}

export function useDeckDetail(deckId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(deckDetailQueryOptions(userId, deckId));
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
  .handler(({ context, data }) =>
    fetchApiJson<DeckResponse>({
      errorTitle: "Couldn't create deck",
      cookie: context.cookie,
      path: "/api/v1/decks",
      method: "POST",
      body: data,
    }),
  );

export function useCreateDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isWanted?: boolean;
      isPublic?: boolean;
    }) => createDeckFn({ data: body }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

const deleteDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    await fetchApi({
      errorTitle: "Couldn't delete deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(deckId)}`,
      method: "DELETE",
    });
  });

export function useDeleteDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (deckId) => deleteDeckFn({ data: deckId }),
    invalidates: [queryKeys.decks.all(userId)],
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
  .handler(({ context, data }) =>
    fetchApiJson<{ cards: DeckCardResponse[] }>({
      errorTitle: "Couldn't save deck cards",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(data.deckId)}/cards`,
      method: "PUT",
      body: { cards: data.cards },
    }),
  );

export function useSaveDeckCards() {
  const userId = useRequiredUserId();
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
        queryKeys.decks.detail(userId, variables.deckId),
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
        queryKey: queryKeys.decks.all(userId),
        exact: true,
      });
    },
  });
}

const updateDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deckId: string; name?: string; format?: DeckFormat }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { deckId, ...fields } = data;
    return fetchApiJson<DeckResponse>({
      errorTitle: "Couldn't update deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(deckId)}`,
      method: "PATCH",
      body: fields,
    });
  });

export function useUpdateDeck() {
  const userId = useRequiredUserId();
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
        queryKeys.decks.detail(userId, variables.deckId),
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, deck: data };
        },
      );

      // Update the deck list entry if it exists (spread to preserve summary-only fields)
      queryClient.setQueryData<DeckListResponse>(queryKeys.decks.all(userId), (old) => {
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

const setDeckPinnedFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deckId: string; isPinned: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<DeckResponse>({
      errorTitle: "Couldn't update deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(data.deckId)}/pin`,
      method: "PATCH",
      body: { isPinned: data.isPinned },
    }),
  );

const setDeckArchivedFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deckId: string; archived: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<DeckResponse>({
      errorTitle: "Couldn't update deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(data.deckId)}/archive`,
      method: "PATCH",
      body: { archived: data.archived },
    }),
  );

function applyDeckUpdateToCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  deckId: string,
  data: DeckResponse,
) {
  queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(userId, deckId), (old) =>
    old ? { ...old, deck: data } : old,
  );
  queryClient.setQueryData<DeckListResponse>(queryKeys.decks.all(userId), (old) => {
    if (!old) {
      return old;
    }
    return {
      items: old.items.map((item) =>
        item.deck.id === deckId ? { ...item, deck: { ...item.deck, ...data } } : item,
      ),
    };
  });
}

export function useSetDeckPinned() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, isPinned }: { deckId: string; isPinned: boolean }) =>
      setDeckPinnedFn({ data: { deckId, isPinned } }),
    onSuccess: (data, variables) =>
      applyDeckUpdateToCaches(queryClient, userId, variables.deckId, data),
  });
}

export function useSetDeckArchived() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, archived }: { deckId: string; archived: boolean }) =>
      setDeckArchivedFn({ data: { deckId, archived } }),
    onSuccess: (data, variables) =>
      applyDeckUpdateToCaches(queryClient, userId, variables.deckId, data),
  });
}

const cloneDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }) =>
    fetchApiJson<DeckResponse>({
      errorTitle: "Couldn't clone deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(deckId)}/clone`,
      method: "POST",
    }),
  );

export function useCloneDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (deckId: string) => cloneDeckFn({ data: deckId }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

type ExportFormat = "piltover" | "text" | "tts";

const exportDeckFn = createServerFn({ method: "GET" })
  .inputValidator((input: { deckId: string; format?: ExportFormat }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const params = new URLSearchParams();
    if (data.format) {
      params.set("format", data.format);
    }
    const query = params.toString();
    const path = `/api/v1/decks/${encodeURIComponent(data.deckId)}/export${query ? `?${query}` : ""}`;
    return fetchApiJson<DeckExportResponse>({
      errorTitle: "Couldn't export deck",
      cookie: context.cookie,
      path,
    });
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
  .handler(
    ({ context, data: deckId }): Promise<DeckShareResponse> =>
      fetchApiJson<DeckShareResponse>({
        errorTitle: "Couldn't share deck",
        cookie: context.cookie,
        path: `/api/v1/decks/${encodeURIComponent(deckId)}/share`,
        method: "POST",
      }),
  );

export function useShareDeck() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) => shareDeckFn({ data: deckId }),
    onSuccess: (data, deckId) => {
      queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(userId, deckId), (old) =>
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
    await fetchApi({
      errorTitle: "Couldn't unshare deck",
      cookie: context.cookie,
      path: `/api/v1/decks/${encodeURIComponent(deckId)}/share`,
      method: "DELETE",
    });
  });

export function useUnshareDeck() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) => unshareDeckFn({ data: deckId }),
    onSuccess: (_, deckId) => {
      queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(userId, deckId), (old) =>
        old ? { ...old, deck: { ...old.deck, isPublic: false, shareToken: null } } : old,
      );
    },
  });
}

const fetchPublicDeckFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicDeckDetailResponse> => {
    // 404 is legitimate (unknown/expired token) — map to NOT_FOUND without logging.
    const res = await fetchApi({
      errorTitle: "Couldn't load shared deck",
      path: `/api/v1/decks/share/${encodeURIComponent(token)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
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
  .handler(
    ({ context, data: token }): Promise<DeckCloneResponse> =>
      fetchApiJson<DeckCloneResponse>({
        errorTitle: "Couldn't clone shared deck",
        cookie: context.cookie,
        path: `/api/v1/decks/share/${encodeURIComponent(token)}/clone`,
        method: "POST",
      }),
  );

export function useCloneSharedDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckCloneResponse, string>({
    mutationFn: (token) => cloneSharedDeckFn({ data: token }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}
