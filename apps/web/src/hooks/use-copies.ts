import type {
  CopyListMembershipsResponse,
  CopyMetadataPatch,
  CopyResponse,
} from "@openrift/shared";
import { definedCopyMetadataFields, normalizeCopyMetadataPatch } from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts";
import { createTransaction, eq, useLiveQuery } from "@tanstack/react-db";
import { useBatcher } from "@tanstack/react-pacer";
import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { trackEvent } from "@/lib/analytics";
import { useUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import { randomUuid } from "@/lib/random-uuid";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";
import { isTempCopyId, TEMP_COPY_ID_PREFIX } from "@/lib/temp-copy-id";
import { withTimeout } from "@/lib/with-timeout";

const BATCH_SIZE = 500;

/**
 * Resolves a collection's owning group from the cached collections list, so
 * optimistic copy rows carry the same `groupId` the server feed would assign.
 * Without it, a copy added to a group collection would briefly count as a
 * personal "owned" copy until the next feed refetch. Returns null for personal
 * collections (and when the collection isn't cached yet — the common case is
 * personal, and a refetch corrects any miss).
 * @returns The collection's group id, or null.
 */
function groupIdForCollection(
  queryClient: QueryClient,
  userId: string,
  collectionId: string,
): string | null {
  const cached = queryClient.getQueryData<CollectionsResponse>(queryKeys.collections.all(userId));
  return cached?.items.find((col) => col.id === collectionId)?.groupId ?? null;
}

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function useCopies(collectionId?: string): {
  data: CopyResponse[];
  isReady: boolean;
} {
  const copiesCollection = useCopiesCollection();

  const { data, isReady } = useLiveQuery(
    (q) => {
      if (!copiesCollection) {
        return null;
      }
      const base = q.from({ copy: copiesCollection });
      return collectionId === undefined
        ? base
        : base.where(({ copy }) => eq(copy.collectionId, collectionId));
    },
    [collectionId, copiesCollection],
  );

  return { data: data ?? [], isReady };
}

/**
 * Which of the viewer's own lists reference `copyIds`. Backs the dispose
 * confirmation's cross-list warning, so it stays disabled until `enabled` (the
 * dialog is open) and there is at least one id. Ids are deduped + sorted for a
 * stable query key across selection order. Pass `excludeListId` to drop the
 * originating list from the result — used by the "Sold" action on a list page,
 * where the copy is necessarily on the current list and only the *other* lists
 * are worth warning about.
 * @returns react-query result carrying a `CopyListMembershipsResponse`.
 */
export function useCopyListMemberships(
  copyIds: string[],
  enabled: boolean,
  excludeListId?: string,
) {
  const userId = useUserId();
  const stableIds = [...new Set(copyIds)].toSorted();
  return useQuery({
    queryKey: queryKeys.copies.listMemberships(userId ?? "", stableIds, excludeListId),
    queryFn: (): Promise<CopyListMembershipsResponse> =>
      browserApiOrpcClient(copiesContract).listMemberships({ copyIds: stableIds, excludeListId }),
    enabled: enabled && Boolean(userId) && stableIds.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// All three mutations run entirely client-side: direct fetch to /api/v1/*
// with an AbortController so the timeout can actually cancel the in-flight
// request (vs the createServerFn indirection, which stalls indefinitely
// when the client can't reach the Start server).
//
// Optimistic state flows through the copies collection:
//   - Adds: writeInsert with a temp id at click time (in useBatchedAddCopies);
//     the mutation swaps temp → real via writeBatch on success, writeDelete
//     on error.
//   - Moves: collection.update inside createTransaction; mutationFn confirms
//     via utils.writeUpdate.
//   - Deletes: collection.delete inside createTransaction; mutationFn
//     confirms via utils.writeDelete.

/** A created copy as returned by POST /copies — CopyResponse minus groupId
 *  (derived client-side from the cached collections list). */
type AddCopyResult = Omit<CopyResponse, "groupId">;

/** Metadata defaults for optimistic rows created before the server responds. */
const EMPTY_COPY_METADATA = {
  condition: null,
  grader: null,
  grade: null,
  notesPublic: null,
  notesPrivate: null,
  isAltered: false,
  links: [],
} satisfies Partial<CopyResponse>;

// Normalize a genuine network failure (offline/DNS/CORS, which fetch throws as a
// TypeError) into a message the toast can show. An abort throws a
// DOMException("AbortError"), which is NOT a TypeError and so propagates
// untouched to withTimeout — exactly as before. A non-2xx becomes an ApiError
// (from callApi/callApiJson) carrying the server's message, also propagated.
// Shared by the three copy mutations, all of which run directly in the browser.
function rethrowAsNetworkError(error: unknown): never {
  if (error instanceof TypeError) {
    // oxlint-disable-next-line unicorn/prefer-type-error -- this is a network failure, not a type check
    throw new Error("Can't reach the server — check your connection");
  }
  throw error;
}

async function addCopiesApi(
  body: { copies: { printingId: string; collectionId?: string }[] },
  signal: AbortSignal,
): Promise<AddCopyResult[]> {
  try {
    // POST /copies returns the { items } envelope (CopyAddResponse) — the typed
    // client infers it, so the caller maps over the real array, not the object.
    const { items } = await browserApiOrpcClient(copiesContract).add(body, { signal });
    return items;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function moveCopiesApi(
  body: { copyIds: string[]; toCollectionId: string },
  signal: AbortSignal,
): Promise<void> {
  try {
    await browserApiOrpcClient(copiesContract).move(body, { signal });
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function disposeCopiesApi(body: { copyIds: string[] }, signal: AbortSignal): Promise<void> {
  try {
    await browserApiOrpcClient(copiesContract).dispose(body, { signal });
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

export function useAddCopies() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    // "always" means the mutationFn runs regardless of browser online state.
    // Default is "online", which *pauses* the mutation when offline — fetch
    // never fires, our AbortController / withTimeout never trigger, the user
    // sees the optimistic temp row stuck with zero feedback. We want: fetch
    // fires, fails fast with TypeError, catch runs writeDelete + toast.
    networkMode: "always",
    mutationFn: async (body: {
      copies: { printingId: string; collectionId?: string }[];
      // Caller-provided temp ids for optimistic rows already in the synced
      // store (see useBatchedAddCopies). On success we swap temps → reals
      // atomically; on failure we remove the temps.
      tempIds?: string[];
    }): Promise<AddCopyResult[]> => {
      // Hook runs on the public /cards page (via useQuickAddActions ->
      // useBatchedAddCopies), but the add buttons are gated on isLoggedIn,
      // so reaching mutationFn without a userId means a UI bug.
      if (!userId) {
        throw new Error("Cannot add copies while signed out");
      }
      const controller = new AbortController();
      const tempIds = body.tempIds ?? [];
      const hasTempIds = tempIds.length > 0;
      try {
        const apiResult = await withTimeout(
          addCopiesApi({ copies: body.copies }, controller.signal),
          {
            label: "Add copies",
            abortController: controller,
          },
        );
        const realRows: CopyResponse[] = apiResult.map((item) => ({
          ...item,
          groupId: groupIdForCollection(queryClient, userId, item.collectionId),
        }));
        if (copiesCollection) {
          if (hasTempIds) {
            copiesCollection.utils.writeBatch(() => {
              copiesCollection.utils.writeDelete(tempIds);
              copiesCollection.utils.writeInsert(realRows);
            });
          } else {
            copiesCollection.utils.writeInsert(realRows);
          }
        }
        // Mark the shared per-user copies cache stale (without an eager
        // refetch). The collection's queryFn reads this cache via
        // ensureQueryData, so without invalidation the next refetch (e.g.
        // on network reconnect) would hand back pre-mutation data and
        // clobber our writes to the synced store.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.copies.all(userId),
          refetchType: "none",
        });
        // Refetch the collections list so the header's totalValueCents /
        // unpricedCopyCount catch up. copyCount is already live (derived
        // from the copies collection in useCollections), but value totals
        // are computed server-side via joins to the price table.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.collections.all(userId),
        });
        trackEvent("collection-add", { count: apiResult.length });
        return apiResult;
      } catch (error) {
        if (hasTempIds && copiesCollection) {
          copiesCollection.utils.writeDelete(tempIds);
        }
        throw error;
      }
    },
  });
}

export function useMoveCopies() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      copyIds,
      toCollectionId,
    }: {
      copyIds: string[];
      toCollectionId: string;
    }) => {
      if (!userId || !copiesCollection) {
        return;
      }
      // Drop optimistic temp ids — they reference rows still in flight from
      // useBatchedAddCopies and aren't valid uuids, so the move API would
      // 400. The temp row's collectionId was set at insert time, and the
      // server-assigned row that replaces it on add-success will inherit
      // whatever collection the original add targeted; treating the move as
      // a no-op for in-flight rows keeps the user's intent local to this
      // mutation rather than reaching across the in-flight add.
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        return;
      }
      const collection = copiesCollection;
      const tx = createTransaction<CopyResponse>({
        mutationFn: async ({ transaction }) => {
          const ids = transaction.mutations.map((m) => String(m.key));
          for (const batch of chunks(ids, BATCH_SIZE)) {
            const controller = new AbortController();
            await withTimeout(
              moveCopiesApi({ copyIds: batch, toCollectionId }, controller.signal),
              {
                label: "Move copies",
                abortController: controller,
              },
            );
          }
          // Confirm the move in the synced store — partial updates keyed by id.
          collection.utils.writeUpdate(ids.map((id) => ({ id, collectionId: toCollectionId })));
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all(userId),
            refetchType: "none",
          });
          // Refresh per-collection totals. The source and destination
          // collections' totalValueCents shift even though the global total
          // doesn't.
          void queryClient.invalidateQueries({
            queryKey: queryKeys.collections.all(userId),
          });
        },
      });
      tx.mutate(() => {
        for (const id of realCopyIds) {
          collection.update(id, (draft) => {
            draft.collectionId = toCollectionId;
          });
        }
      });
      await tx.isPersisted.promise;
    },
  });
}

async function updateCopiesApi(
  body: { copyIds: string[]; patch: CopyMetadataPatch },
  signal: AbortSignal,
): Promise<void> {
  try {
    await browserApiOrpcClient(copiesContract).update(body, { signal });
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

/**
 * Applies one metadata patch (condition, grading, notes, links — ADR-038) to a
 * batch of copies, optimistically. The patch is normalized with the same
 * shared helper the server uses, so the optimistic rows match what the next
 * feed refetch would return.
 *
 * @returns The mutation; call `mutate({ copyIds, patch })`.
 */
export function useUpdateCopies() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ copyIds, patch }: { copyIds: string[]; patch: CopyMetadataPatch }) => {
      if (!userId || !copiesCollection) {
        return;
      }
      // Drop optimistic temp ids — rows still in flight from
      // useBatchedAddCopies aren't valid uuids, so the API would 400.
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        return;
      }
      const applied = definedCopyMetadataFields(normalizeCopyMetadataPatch(patch));
      const collection = copiesCollection;
      const tx = createTransaction<CopyResponse>({
        mutationFn: async ({ transaction }) => {
          const ids = transaction.mutations.map((m) => String(m.key));
          for (const batch of chunks(ids, BATCH_SIZE)) {
            const controller = new AbortController();
            await withTimeout(updateCopiesApi({ copyIds: batch, patch }, controller.signal), {
              label: "Update copies",
              abortController: controller,
            });
          }
          // Confirm the patch in the synced store — partial updates keyed by id.
          collection.utils.writeUpdate(ids.map((id) => ({ id, ...applied })));
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all(userId),
            refetchType: "none",
          });
        },
      });
      tx.mutate(() => {
        for (const id of realCopyIds) {
          collection.update(id, (draft) => {
            Object.assign(draft, applied);
          });
        }
      });
      await tx.isPersisted.promise;
    },
  });
}

// ── Batched add ─────────────────────────────────────────────────────────────

const BATCH_DELAY = 300;

interface PendingAdd {
  printingId: string;
  collectionId: string;
  tempId: string;
  resolve: (result: AddCopyResult) => void;
  reject: (error: unknown) => void;
}

interface BatchedAddCallbacks {
  onBatchSuccess?: (printingIds: string[]) => void;
  onBatchError?: (printingIds: string[], error: unknown) => void;
}

/**
 * Batches rapid add-copy calls into a single POST request and applies
 * optimistic inserts into the copies collection so owned-count reflects the
 * new rows immediately. On API success, temp rows are swapped for server-
 * assigned rows atomically. On failure, temps are removed.
 *
 * Caller must pass a concrete collectionId — the inbox-default path doesn't
 * support optimistic because the inbox id isn't known from the add call.
 *
 * Optional batch callbacks fire once per API batch (not per add), so callers
 * can surface one toast per batch instead of one per click.
 * @returns An `add` function, a `tempId` provider for optimistic session
 *   tracking, and an `isPending` flag.
 */
export function useBatchedAddCopies(callbacks?: BatchedAddCallbacks) {
  const copiesCollection = useCopiesCollection();
  const addCopies = useAddCopies();
  const queryClient = useQueryClient();
  const userId = useUserId();
  // useBatcher captures its handler once; ref keeps the latest callbacks
  // so we don't recreate the batcher whenever the consumer re-renders.
  // Update in an effect — writing to a ref during render trips React Compiler.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const batcher = useBatcher<PendingAdd>(
    (pending) => {
      const printingIds = pending.map((entry) => entry.printingId);
      addCopies.mutate(
        {
          copies: pending.map((entry) => ({
            printingId: entry.printingId,
            collectionId: entry.collectionId,
          })),
          tempIds: pending.map((entry) => entry.tempId),
        },
        {
          onSuccess: (data) => {
            for (let i = 0; i < pending.length; i++) {
              pending[i].resolve(data[i]);
            }
            callbacksRef.current?.onBatchSuccess?.(printingIds);
          },
          onError: (error) => {
            for (const entry of pending) {
              entry.reject(error);
            }
            callbacksRef.current?.onBatchError?.(printingIds, error);
          },
        },
      );
    },
    { wait: BATCH_DELAY },
  );

  const add = useCallback(
    (
      printingId: string,
      collectionId: string,
    ): { tempId: string; result: Promise<AddCopyResult> } => {
      // Optimistic: insert the row into the synced store immediately with a
      // temp id so owned-count / grid filters update now, not after the 300ms
      // batch window + API round-trip. The mutation swaps this for the real
      // server-assigned row on success. The tempId is returned so callers
      // can record it in session-level "recently added" UI immediately and
      // swap for the real id after the API confirms.
      const tempId = `${TEMP_COPY_ID_PREFIX}${randomUuid()}`;
      if (copiesCollection) {
        const groupId = userId ? groupIdForCollection(queryClient, userId, collectionId) : null;
        copiesCollection.utils.writeInsert([
          { id: tempId, printingId, collectionId, groupId, ...EMPTY_COPY_METADATA, onLoan: false },
        ]);
      }
      // oxlint-disable-next-line promise/avoid-new -- deferred pattern needed to batch individual calls into one POST
      const result = new Promise<AddCopyResult>((resolve, reject) => {
        batcher.addItem({ printingId, collectionId, tempId, resolve, reject });
      });
      return { tempId, result };
    },
    [copiesCollection, batcher, queryClient, userId],
  );

  return { add, isPending: addCopies.isPending };
}

export function useDisposeCopies() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ copyIds }: { copyIds: string[] }) => {
      if (!userId || !copiesCollection) {
        return;
      }
      // Drop optimistic temp ids — they reference rows still in flight from
      // useBatchedAddCopies and aren't valid uuids, so the API would 400.
      // Leaving the temp row alone here also avoids the swap-after-delete
      // race where the add would later re-insert a real row the user thought
      // they removed.
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        return;
      }
      const collection = copiesCollection;
      const tx = createTransaction<CopyResponse>({
        mutationFn: async ({ transaction }) => {
          const ids = transaction.mutations.map((m) => String(m.key));
          for (const batch of chunks(ids, BATCH_SIZE)) {
            const controller = new AbortController();
            await withTimeout(disposeCopiesApi({ copyIds: batch }, controller.signal), {
              label: "Dispose copies",
              abortController: controller,
            });
          }
          // Confirm the deletions in the synced store.
          collection.utils.writeDelete(ids);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all(userId),
            refetchType: "none",
          });
          // Refresh the collections list so the header's totalValueCents /
          // unpricedCopyCount drop to match the new copies state.
          void queryClient.invalidateQueries({
            queryKey: queryKeys.collections.all(userId),
          });
        },
      });
      tx.mutate(() => {
        for (const id of realCopyIds) {
          collection.delete(id);
        }
      });
      await tx.isPersisted.promise;
      trackEvent("collection-remove", { count: realCopyIds.length });
    },
  });
}
