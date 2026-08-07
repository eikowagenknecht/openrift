import type {
  CardType,
  DeckCardResponse,
  DeckCloneResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckFormatConfig,
  DeckListResponse,
  DeckOddsConfig,
  DeckResponse,
  DeckShareResponse,
  DeckZone,
  Domain,
  PublicDeckDetailResponse,
  SuperType,
} from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { decksContract } from "@openrift/shared/contracts/decks";
import { publicDecksContract } from "@openrift/shared/contracts/public-decks";
import { isDefinedError, safe } from "@orpc/client";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

const fetchDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DeckListResponse> =>
    apiOrpcClient(decksContract, context.cookie).list({ includeArchived: "true" }),
  );

async function fetchDeckDetailImpl(
  cookie: string | undefined,
  deckId: string,
): Promise<DeckDetailResponse> {
  // 404 is legitimate (unknown/deleted deck id, or one belonging to another
  // user) — map to NOT_FOUND so the route can render a not-found page
  // without logging the response as an error.
  const { error, data } = await safe(apiOrpcClient(decksContract, cookie).get({ id: deckId }));
  if (error) {
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
 * Synthesize a deck-detail response for a browser-local deck (ADR-035) from the
 * local store — no server fetch, no session. Mirrors {@link DeckDetailResponse}
 * so every read-only builder consumer works unchanged; the owner-only fields
 * (isPublic / shareToken / isPinned / archivedAt / isWanted) are constants
 * because a local deck has no server-side state.
 *
 * @returns The synthesized detail in `{ data }` form, matching `useDeckDetail`.
 */
function useLocalDeckDetail(deckId: string): { data: DeckDetailResponse } {
  const deck = useLocalDecksStore((state) => state.decks[deckId]);
  // The editor subtree is keyed on deckId and the builder route renders a
  // not-found for a missing local id before mounting the editor, so `deck` is
  // present in practice; the fallbacks just keep the type total during the
  // brief pre-hydration window.
  const data: DeckDetailResponse = {
    deck: {
      id: deckId,
      name: deck?.name ?? "Deck",
      description: deck?.description ?? null,
      format: deck?.format ?? WellKnown.deckFormat.CONSTRUCTED,
      formatConfig: deck?.formatConfig ?? null,
      isWanted: false,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: null,
      // Local decks keep their odds settings in the device-local store, not here.
      oddsConfig: null,
      coverCardId: deck?.coverCardId ?? null,
      coverPrintingId: deck?.coverPrintingId ?? null,
      coverPosition: deck?.coverPosition ?? null,
      createdAt: deck?.createdAt ?? "",
      updatedAt: deck?.updatedAt ?? "",
    },
    cards: deck?.cards ?? [],
  };
  return { data };
}

/**
 * Deck detail for the builder. A `local:` id resolves reactively from the local
 * store (works logged out); a server id keeps the suspense query. All hooks are
 * called unconditionally (rules-of-hooks): for a local id the suspense query is
 * inert — seeded with `initialData` and never revalidated — and the reactive
 * store value is returned instead.
 *
 * @returns The deck detail in `{ data }` form.
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
      isWanted?: boolean;
      isPublic?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckResponse> =>
    apiOrpcClient(decksContract, context.cookie).create(data),
  );

export function useCreateDeck() {
  // Logged-out-safe: a local-only visitor instantiates this hook (the create
  // dialog / import page branch on session before ever calling `.mutate`), so
  // gate the invalidation on a present userId instead of throwing on mount.
  const userId = useUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      format: DeckFormat;
      isWanted?: boolean;
      isPublic?: boolean;
    }) => createDeckFn({ data: body }),
    invalidates: userId ? [queryKeys.decks.all(userId)] : [],
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
  .handler(({ context, data }): Promise<{ cards: DeckCardResponse[] }> =>
    apiOrpcClient(decksContract, context.cookie).replaceCards({
      id: data.deckId,
      cards: data.cards,
    }),
  );

export function useSaveDeckCards() {
  // Logged-out-safe: the claim-on-login flow is the only caller and always runs
  // with a session, but the import page instantiates the hook before knowing
  // the session, so don't throw on mount.
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
      oddsConfig?: DeckOddsConfig | null;
      coverCardId?: string | null;
      coverPrintingId?: string | null;
      coverPosition?: number | null;
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
  // Logged-out-safe: the rename / description / change-format dialogs are shared
  // with local decks, which branch to the local store before `.mutate`; gate the
  // cache writes on a present userId instead of throwing on mount.
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
    }): Promise<DeckResponse> => updateDeckFn({ data: { deckId, ...fields } }),
    onSuccess: (data, variables) => {
      if (!userId) {
        return;
      }
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

/** Metadata patch shared by rename / description / change-format / cover surfaces. */
export interface DeckMetaPatch {
  name?: string;
  description?: string | null;
  format?: DeckFormat;
  formatConfig?: DeckFormatConfig | null;
  coverCardId?: string | null;
  coverPrintingId?: string | null;
  coverPosition?: number | null;
}

/**
 * One metadata-update entry point that branches on the `local:` prefix: a local
 * deck writes straight to the local store (synchronous); a server deck goes
 * through {@link useUpdateDeck}. Lets the shared rename / description /
 * change-format surfaces stay single-code-path instead of forking per deck kind.
 *
 * @returns `update(patch, opts?)` plus the server mutation's pending flag.
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

const cloneDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }): Promise<DeckResponse> =>
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

/** A single card sent to the public, stateless deck-code encoder (local decks). */
export interface EncodeDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

// Public (no-cookie) encoder for browser-local decks, which have no server row
// to `export` by id. Reuses the same server codecs as the authenticated export.
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

// ── Deck sharing ────────────────────────────────────────────────────────────

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
    // 404 (unknown/expired token) is a typed NOT_FOUND error mapped to the
    // sentinel the route boundary expects.
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
