import type {
  DeckCardResponse,
  DeckCloneResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckFormatConfig,
  DeckListResponse,
  DeckResponse,
  DeckShareResponse,
  DeckZone,
  PublicDeckDetailResponse,
} from "@openrift/shared";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<DeckListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks.$get({
          query: { includeArchived: "true" },
        }),
        "Couldn't load decks",
      ),
  );

async function fetchDeckDetailImpl(
  cookie: string | undefined,
  deckId: string,
): Promise<DeckDetailResponse> {
  // 404 is legitimate (unknown/deleted deck id, or one belonging to another
  // user) — map to NOT_FOUND so the route can render a not-found page
  // without logging the response as an error.
  const res = await callApi(
    serverApiClient(cookie).api.v1.decks[":id"].$get({ param: encodeParams({ id: deckId }) }),
    "Couldn't load deck",
    [404],
  );
  if ((res.status as number) === 404) {
    throw new Error("NOT_FOUND");
  }
  return res.json();
}

const fetchDeckDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }) => fetchDeckDetailImpl(context.cookie, deckId));

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
    queryFn: (): Promise<DeckDetailResponse> => fetchDeckDetail({ data: deckId }),
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
  .handler(
    ({ context, data }): Promise<DeckResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks.$post({
          json: data,
        }),
        "Couldn't create deck",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.decks[":id"].$delete({
        param: encodeParams({ id: deckId }),
      }),
      "Couldn't delete deck",
    );
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
  .handler(
    ({ context, data }): Promise<{ cards: DeckCardResponse[] }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].cards.$put({
          param: encodeParams({ id: data.deckId }),
          json: { cards: data.cards },
        }),
        "Couldn't save deck cards",
      ),
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
  .inputValidator(
    (input: {
      deckId: string;
      name?: string;
      description?: string | null;
      format?: DeckFormat;
      formatConfig?: DeckFormatConfig | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> => {
    const { deckId, ...fields } = data;
    return callApiJson(
      serverApiClient(context.cookie).api.v1.decks[":id"].$patch({
        param: encodeParams({ id: deckId }),
        // The route types formatConfig as a loose record; DeckFormatConfig is the
        // concrete shape (no index signature), so widen it at the boundary.
        json: { ...fields, formatConfig: fields.formatConfig as Record<string, unknown> | null },
      }),
      "Couldn't update deck",
    );
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
      description?: string | null;
      format?: DeckFormat;
      formatConfig?: DeckFormatConfig | null;
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
  .handler(
    ({ context, data }): Promise<DeckResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].pin.$patch({
          param: encodeParams({ id: data.deckId }),
          json: { isPinned: data.isPinned },
        }),
        "Couldn't update deck",
      ),
  );

const setDeckArchivedFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deckId: string; archived: boolean }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].archive.$patch({
          param: encodeParams({ id: data.deckId }),
          json: { archived: data.archived },
        }),
        "Couldn't update deck",
      ),
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
  .handler(
    ({ context, data: deckId }): Promise<DeckResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].clone.$post({
          param: encodeParams({ id: deckId }),
        }),
        "Couldn't clone deck",
      ),
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
  .handler(
    ({ context, data }): Promise<DeckExportResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].export.$get({
          param: encodeParams({ id: data.deckId }),
          // The route declares a query schema, so hc requires the `query` arg
          // even when empty; `{}` lets the API apply its `format` default
          // (piltover) — matching the old "omit the param" behavior.
          query: data.format ? { format: data.format } : {},
        }),
        "Couldn't export deck",
      ),
  );

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
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].share.$post({
          param: encodeParams({ id: deckId }),
        }),
        "Couldn't share deck",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.decks[":id"].share.$delete({
        param: encodeParams({ id: deckId }),
      }),
      "Couldn't unshare deck",
    );
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
    const res = await callApi(
      serverApiClient().api.v1.decks.share[":token"].$get({
        param: encodeParams({ token }),
      }),
      "Couldn't load shared deck",
      [404],
    );
    if ((res.status as number) === 404) {
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
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks.share[":token"].clone.$post({
          param: encodeParams({ token }),
        }),
        "Couldn't clone shared deck",
      ),
  );

export function useCloneSharedDeck() {
  // Hook runs on the public /decks/share/$token route. Logged-out
  // viewers see a "Sign in to clone" prompt, so the mutate path
  // shouldn't fire without a userId — but keep the invalidate
  // conditional so the hook itself never throws.
  const userId = useUserId();
  return useMutationWithInvalidation<DeckCloneResponse, string>({
    mutationFn: (token) => cloneSharedDeckFn({ data: token }),
    invalidates: userId ? [queryKeys.decks.all(userId)] : [],
  });
}
