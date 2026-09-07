import type {
  DeckCardResponse,
  DeckCloneResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckFormatConfig,
  DeckLink,
  DeckListResponse,
  DeckOddsConfig,
  DeckResponse,
  DeckShareResponse,
  DeckZone,
  PublicDeckDetailResponse,
} from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { decksContract } from "@openrift/shared/contracts/decks";
import { publicDecksContract } from "@openrift/shared/contracts/public-decks";
import { isDefinedError, safe } from "@orpc/client";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import type { EncodeDeckCardInput } from "@/lib/deck-encode-input";
import { isLocalDeckId } from "@/lib/local-deck";
import { reportMutationError } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";
import { useLocalDecksStore } from "@/stores/local-decks-store";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DeckListResponse> =>
    apiOrpcClient(decksContract, context.cookie).list({ includeArchived: "true" }),
  );

async function fetchDeckDetailImpl(
  cookie: string | undefined,
  deckId: string,
): Promise<DeckDetailResponse> {
  const { error, data } = await safe(apiOrpcClient(decksContract, cookie).get({ id: deckId }));
  if (error) {
    // The route matches this exact message to render its not-found page.
    if (isDefinedError(error) && error.code === "NOT_FOUND") {
      throw new Error("NOT_FOUND");
    }
    throw error;
  }
  return data;
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

/**
 * Synthesizes a deck-detail response for a browser-local deck from the local
 * store. Owner-only fields (isPublic / shareToken / isPinned / archivedAt) are
 * constants because a local deck has no server-side state.
 */
function useLocalDeckDetail(deckId: string): { data: DeckDetailResponse } {
  const deck = useLocalDecksStore((state) => state.decks[deckId]);
  const data: DeckDetailResponse = {
    deck: {
      id: deckId,
      name: deck?.name ?? "Deck",
      description: deck?.description ?? null,
      format: deck?.format ?? WellKnown.deckFormat.CONSTRUCTED,
      formatConfig: deck?.formatConfig ?? null,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: null,
      oddsConfig: null,
      coverCardId: deck?.coverCardId ?? null,
      coverPrintingId: deck?.coverPrintingId ?? null,
      coverPosition: deck?.coverPosition ?? null,
      links: deck?.links ?? [],
      collectionId: null,
      familyId: null,
      predecessorDeckId: null,
      isPrimary: false,
      isDraft: false,
      createdAt: deck?.createdAt ?? "",
      updatedAt: deck?.updatedAt ?? "",
    },
    cards: deck?.cards ?? [],
  };
  return { data };
}

/**
 * A `local:` id resolves from the local store; a server id keeps the suspense
 * query, called unconditionally either way and left inert for a local id.
 */
export function useDeckDetail(deckId: string): { data: DeckDetailResponse } {
  const isLocal = isLocalDeckId(deckId);
  const userId = useUserId();
  const local = useLocalDeckDetail(deckId);
  const query = useSuspenseQuery(
    isLocal
      ? {
          queryKey: queryKeys.decks.detail("local", deckId),
          queryFn: () => local.data,
          initialData: local.data,
          staleTime: Number.POSITIVE_INFINITY,
        }
      : deckDetailQueryOptions(userId ?? "", deckId),
  );
  return isLocal ? local : query;
}

const createDeckFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isPublic?: boolean;
      links?: DeckLink[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).create(data),
  );

export function useCreateDeck() {
  // A local-only visitor instantiates this hook before ever calling `.mutate`; do not throw on a missing userId.
  const userId = useUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isPublic?: boolean;
      links?: DeckLink[];
    }) => createDeckFn({ data: body }),
    invalidates: userId ? [queryKeys.decks.all(userId)] : [],
  });
}

// Exported for tests only — call through useDeleteDeck in app code.
export const deleteDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: deckId }) => {
    // A 404 means the deck is already gone; treat it as success.
    const { error } = await safe(
      apiOrpcClient(decksContract, context.cookie).remove({ id: deckId }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        return;
      }
      throw error;
    }
  });

export function useDeleteDeck() {
  // Shared with local decks, which branch to the local store before `.mutate`; do not throw on a missing userId.
  const userId = useUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (deckId) => deleteDeckFn({ data: deckId }),
    invalidates: userId ? [queryKeys.decks.all(userId)] : [],
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
  .handler(({ context, data }): Promise<{ cards: DeckCardResponse[] }> =>
    apiOrpcClient(decksContract, context.cookie).replaceCards({
      id: data.deckId,
      cards: data.cards,
    }),
  );

export function useSaveDeckCards() {
  // The import page instantiates this hook before knowing the session; do not throw on a missing userId.
  const userId = useUserId();
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
      if (!userId) {
        return;
      }
      queryClient.setQueryData<DeckDetailResponse>(
        queryKeys.decks.detail(userId, variables.deckId),
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, cards: data.cards };
        },
      );

      // exact: true keeps this from also refetching the detail query set above.
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
      oddsConfig?: DeckOddsConfig | null;
      coverCardId?: string | null;
      coverPrintingId?: string | null;
      coverPosition?: number | null;
      links?: DeckLink[];
      collectionId?: string | null;
      isDraft?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> => {
    const { deckId, ...fields } = data;
    return apiOrpcClient(decksContract, context.cookie).update({
      id: deckId,
      ...fields,
      // The contract types formatConfig as a loose record; widen it at the boundary.
      formatConfig: fields.formatConfig as Record<string, unknown> | null | undefined,
    });
  });

export function useUpdateDeck() {
  // Shared with local decks, which branch to the local store before `.mutate`; do not throw on a missing userId.
  const userId = useUserId();
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
      oddsConfig?: DeckOddsConfig | null;
      coverCardId?: string | null;
      coverPrintingId?: string | null;
      coverPosition?: number | null;
      links?: DeckLink[];
      collectionId?: string | null;
      isDraft?: boolean;
    }): Promise<DeckResponse> => updateDeckFn({ data: { deckId, ...fields } }),
    onSuccess: (data, variables) => {
      if (!userId) {
        return;
      }
      queryClient.setQueryData<DeckDetailResponse>(
        queryKeys.decks.detail(userId, variables.deckId),
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, deck: data };
        },
      );

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

/** Metadata patch shared by rename / description / change-format / cover surfaces. */
export interface DeckMetaPatch {
  name?: string;
  description?: string | null;
  format?: DeckFormat;
  formatConfig?: DeckFormatConfig | null;
  coverCardId?: string | null;
  coverPrintingId?: string | null;
  coverPosition?: number | null;
  links?: DeckLink[];
}

/**
 * Branches on the `local:` prefix: a local deck writes straight to the local
 * store; a server deck goes through {@link useUpdateDeck}.
 */
export function useUpdateDeckMeta(deckId: string): {
  update: (patch: DeckMetaPatch, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
} {
  const serverUpdate = useUpdateDeck();
  const isLocal = isLocalDeckId(deckId);
  return {
    update: (patch, opts) => {
      if (isLocal) {
        useLocalDecksStore.getState().updateDeck(deckId, patch);
        opts?.onSuccess?.();
        return;
      }
      serverUpdate.mutate({ deckId, ...patch }, opts);
    },
    isPending: isLocal ? false : serverUpdate.isPending,
  };
}

const setDeckPinnedFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; isPinned: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).setPinned({
      id: data.deckId,
      isPinned: data.isPinned,
    }),
  );

const setDeckArchivedFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; archived: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
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

const createDeckVariantFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; name?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).createVariant({
      id: data.deckId,
      ...(data.name ? { name: data.name } : {}),
    }),
  );

export function useCreateDeckVariant() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckResponse, { deckId: string; name?: string }>({
    mutationFn: (input) => createDeckVariantFn({ data: input }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

const linkDeckVariantFn = createServerFn({ method: "POST" })
  .validator(
    (input: { deckId: string; otherDeckId: string; markAsPreviousVersion?: boolean }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).linkVariant({
      id: data.deckId,
      otherDeckId: data.otherDeckId,
      ...(data.markAsPreviousVersion ? { markAsPreviousVersion: true } : {}),
    }),
  );

export function useLinkDeckVariant() {
  const userId = useRequiredUserId();
  // Linking rewrites the family (and possibly the primary) of every member on
  // both sides, so nothing narrower than the decks prefix would stay correct.
  return useMutationWithInvalidation<
    DeckResponse,
    { deckId: string; otherDeckId: string; markAsPreviousVersion?: boolean }
  >({
    mutationFn: (input) => linkDeckVariantFn({ data: input }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

const unlinkDeckVariantFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).unlinkVariant({ id: deckId }),
  );

export function useUnlinkDeckVariant() {
  const userId = useRequiredUserId();
  // Leaving a family can promote a survivor and splice the predecessor chain,
  // so the whole decks prefix (list and details) is refetched.
  return useMutationWithInvalidation<DeckResponse, string>({
    mutationFn: (deckId) => unlinkDeckVariantFn({ data: deckId }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

const setDeckPredecessorFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; predecessorDeckId: string | null }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).setPredecessor({
      id: data.deckId,
      predecessorDeckId: data.predecessorDeckId,
    }),
  );

/**
 * Optimistic: the lineage graph is laid out from these pointers, so waiting
 * for the round trip would leave the picker and the lines showing different things.
 */
export function useSetDeckPredecessor() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    DeckResponse,
    Error,
    { deckId: string; predecessorDeckId: string | null },
    { previous: DeckListResponse | undefined }
  >({
    mutationFn: (input) => setDeckPredecessorFn({ data: input }),
    onMutate: ({ deckId, predecessorDeckId }) => {
      const key = queryKeys.decks.all(userId);
      const previous = queryClient.getQueryData<DeckListResponse>(key);
      if (previous) {
        queryClient.setQueryData<DeckListResponse>(key, {
          items: previous.items.map((item) =>
            item.deck.id === deckId ? { ...item, deck: { ...item.deck, predecessorDeckId } } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.decks.all(userId), context.previous);
      }
      // Declaring onError here replaces the QueryClient's default one; call it
      // explicitly or the rollback happens silently with no error toast.
      reportMutationError(error, queryClient);
    },
    // The rail and lineage list read every member's pointer; invalidating only the changed row misses them.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks.all(userId) });
    },
  });
}

const promoteDeckPrimaryFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).promotePrimary({ id: deckId }),
  );

export function usePromoteDeckPrimary() {
  const userId = useRequiredUserId();
  // Promotion demotes another family member, so a targeted cache patch isn't
  // enough; the prefix invalidation refreshes the list and both details.
  return useMutationWithInvalidation<DeckResponse, string>({
    mutationFn: (deckId) => promoteDeckPrimaryFn({ data: deckId }),
    invalidates: [queryKeys.decks.all(userId)],
  });
}

type ExportFormat = "piltover" | "text" | "tts";

const exportDeckFn = createServerFn({ method: "GET" })
  .validator((input: { deckId: string; format?: ExportFormat }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckExportResponse> =>
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

// Public (no-cookie) encoder for browser-local decks, which have no server row to `export` by id.
const encodeDeckCardsFn = createServerFn({ method: "POST" })
  .validator((input: { format?: ExportFormat; cards: EncodeDeckCardInput[] }) => input)
  .handler(({ data }): Promise<DeckExportResponse> =>
    apiOrpcClient(publicDecksContract).encode(data),
  );

export function useEncodeDeckCards() {
  return useMutationWithInvalidation<
    DeckExportResponse,
    { format?: ExportFormat; cards: EncodeDeckCardInput[] }
  >({
    mutationFn: (input) => encodeDeckCardsFn({ data: input }),
    invalidates: [],
  });
}

const shareDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }): Promise<DeckShareResponse> =>
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
    const { error, data } = await safe(apiOrpcClient(publicDecksContract).share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
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
  .handler(({ context, data: token }): Promise<DeckCloneResponse> =>
    apiOrpcClient(decksContract, context.cookie).cloneShared({ token }),
  );

export function useCloneSharedDeck() {
  const userId = useUserId();
  return useMutationWithInvalidation<DeckCloneResponse, string>({
    mutationFn: (token) => cloneSharedDeckFn({ data: token }),
    invalidates: userId ? [queryKeys.decks.all(userId)] : [],
  });
}
