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
import { decksContract, publicDecksContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<DeckListResponse> =>
      apiOrpcClient(decksContract, context.cookie).list({ includeArchived: "true" }),
  );

async function fetchDeckDetailImpl(
  cookie: string | undefined,
  deckId: string,
): Promise<DeckDetailResponse> {
  // 404 is legitimate (unknown/deleted deck id, or one belonging to another
  // user) — map to NOT_FOUND so the route can render a not-found page
  // without logging the response as an error.
  try {
    return await apiOrpcClient(decksContract, cookie).get({ id: deckId });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      throw new Error("NOT_FOUND");
    }
    throw error;
  }
}

const fetchDeckDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
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
  .validator(
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
      apiOrpcClient(decksContract, context.cookie).create(data),
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

// Exported for tests only — call through useDeleteDeck in app code.
export const deleteDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    // A 404 means the deck is already gone (double-click on the delete confirm,
    // a second tab, a retried request) — the outcome the user asked for, so
    // accept it as success instead of surfacing a "Not found" error toast.
    try {
      await apiOrpcClient(decksContract, context.cookie).remove({ id: deckId });
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        return;
      }
      throw error;
    }
  });

export function useDeleteDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (deckId) => deleteDeckFn({ data: deckId }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

export const saveDeckCardsFn = createServerFn({ method: "POST" })
  .validator(
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
      apiOrpcClient(decksContract, context.cookie).replaceCards({
        id: data.deckId,
        cards: data.cards,
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
  .validator(
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
    return apiOrpcClient(decksContract, context.cookie).update({
      id: deckId,
      ...fields,
      // The contract types formatConfig as a loose record; DeckFormatConfig is
      // the concrete shape (no index signature), so widen it at the boundary.
      formatConfig: fields.formatConfig as Record<string, unknown> | null | undefined,
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
  .validator((input: { deckId: string; isPinned: boolean }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckResponse> =>
      apiOrpcClient(decksContract, context.cookie).setPinned({
        id: data.deckId,
        isPinned: data.isPinned,
      }),
  );

const setDeckArchivedFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; archived: boolean }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckResponse> =>
      apiOrpcClient(decksContract, context.cookie).setArchived({
        id: data.deckId,
        archived: data.archived,
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
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: deckId }): Promise<DeckResponse> =>
      apiOrpcClient(decksContract, context.cookie).clone({ id: deckId }),
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
  .validator((input: { deckId: string; format?: ExportFormat }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckExportResponse> =>
      apiOrpcClient(decksContract, context.cookie).export({
        id: data.deckId,
        // Omitting format lets the contract apply its `piltover` default.
        ...(data.format ? { format: data.format } : {}),
      }),
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
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: deckId }): Promise<DeckShareResponse> =>
      apiOrpcClient(decksContract, context.cookie).share({ id: deckId }),
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
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    await apiOrpcClient(decksContract, context.cookie).unshare({ id: deckId });
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
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicDeckDetailResponse> => {
    // Migrated to oRPC: contract-typed client. 404 (unknown/expired token) is a
    // typed NOT_FOUND error mapped to the sentinel the route boundary expects.
    try {
      return await apiOrpcClient(publicDecksContract).share({ token });
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
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
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: token }): Promise<DeckCloneResponse> =>
      apiOrpcClient(decksContract, context.cookie).cloneShared({ token }),
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
