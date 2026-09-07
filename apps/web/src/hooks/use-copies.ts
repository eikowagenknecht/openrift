import type {
  CopyListMembershipsResponse,
  CopyMetadataPatch,
  CopyResponse,
} from "@openrift/shared";
import { definedCopyMetadataFields, normalizeCopyMetadataPatch } from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts/copies";
import { createTransaction, eq, useLiveQuery } from "@tanstack/react-db";
import { useBatcher } from "@tanstack/react-pacer";
import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

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

const STILL_ADDING_ERROR_MESSAGE = "These cards are still being added. Try again in a moment.";

/**
 * Resolves a collection's owning group from the cached collections list, so
 * optimistic copy rows carry the same `groupId` the server feed would assign.
 * Returns null for personal collections and when the collection isn't cached yet.
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

  const { data, isReady } = useLiveQuery({
    query: (q) => {
      if (!copiesCollection) {
        return null;
      }
      const base = q.from({ copy: copiesCollection });
      return collectionId === undefined
        ? base
        : base.where(({ copy }) => eq(copy.collectionId, collectionId));
    },
  });

  return { data: data ?? [], isReady };
}

/**
 * Which of the viewer's own lists reference `copyIds`. Backs the dispose
 * confirmation's cross-list warning. Ids are deduped and sorted for a stable
 * query key across selection order. Pass `excludeListId` to drop the
 * originating list from the result (the "Sold" action on a list page).
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

// fetch throws a TypeError for offline/DNS/CORS failures; an abort throws
// DOMException("AbortError") instead and must propagate untouched.
function rethrowAsNetworkError(error: unknown): never {
  if (error instanceof TypeError) {
    // oxlint-disable-next-line unicorn/prefer-type-error -- this is a network failure, not a type check
    throw new Error("Can't reach the server — check your connection");
  }
  throw error;
}

async function addCopiesApi(
  body: {
    batchId?: string;
    copies: { id?: string; printingId: string; collectionId?: string }[];
  },
  signal: AbortSignal,
): Promise<AddCopyResult[]> {
  try {
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
    // Default networkMode "online" pauses the mutation while offline, leaving
    // the optimistic temp row stuck with no feedback.
    networkMode: "always",
    mutationFn: async (body: {
      batchId?: string;
      copies: { id?: string; printingId: string; collectionId?: string }[];
      tempIds?: string[];
      clientIds?: string[];
    }): Promise<AddCopyResult[]> => {
      if (!userId) {
        throw new Error("Cannot add copies while signed out");
      }
      const controller = new AbortController();
      const tempIds = body.tempIds ?? [];
      const rollbackIds = [...tempIds, ...(body.clientIds ?? [])];
      const hasRollback = rollbackIds.length > 0;
      try {
        const apiResult = await withTimeout(
          addCopiesApi({ batchId: body.batchId, copies: body.copies }, controller.signal),
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
          copiesCollection.utils.writeBatch(() => {
            copiesCollection.utils.writeDelete(tempIds);
            copiesCollection.utils.writeUpsert(realRows);
          });
        }
        // Marks the cache stale without refetching, so a later refetch (e.g. on
        // reconnect) doesn't hand back pre-mutation data and clobber the synced store.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.copies.all(userId),
          refetchType: "none",
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.collections.all(userId),
        });
        trackEvent("collection-add", { count: apiResult.length });
        return apiResult;
      } catch (error) {
        if (hasRollback && copiesCollection) {
          copiesCollection.utils.writeDelete(rollbackIds);
        }
        // A lost response may still have created the rows, so resync rather
        // than trust the rollback.
        void queryClient.invalidateQueries({ queryKey: queryKeys.copies.all(userId) });
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
      // Temp ids aren't valid uuids, so the move API would 400; treat as a no-op.
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        throw new Error(STILL_ADDING_ERROR_MESSAGE);
      }
      const collection = copiesCollection;
      // groupId must travel with collectionId: the invalidation below is
      // refetchType "none", so nothing re-reads the feed to recompute it.
      const toGroupId = groupIdForCollection(queryClient, userId, toCollectionId);
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
            // Confirm each chunk immediately so a later chunk's failure only rolls
            // back the not-yet-committed remainder.
            collection.utils.writeUpdate(
              batch.map((id) => ({ id, collectionId: toCollectionId, groupId: toGroupId })),
            );
          }
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all(userId),
            refetchType: "none",
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.collections.all(userId),
          });
        },
      });
      tx.mutate(() => {
        for (const id of realCopyIds) {
          collection.update(id, (draft) => {
            draft.collectionId = toCollectionId;
            draft.groupId = toGroupId;
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
 * Applies one metadata patch (condition, grading, notes, links) to a batch of
 * copies, optimistically.
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
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        throw new Error(STILL_ADDING_ERROR_MESSAGE);
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
            // Confirm each chunk immediately so a later chunk's failure only rolls
            // back the not-yet-committed remainder.
            collection.utils.writeUpdate(batch.map((id) => ({ id, ...applied })));
          }
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

const BATCH_DELAY = 300;

interface PendingAdd {
  printingId: string;
  collectionId: string;
  rowId: string;
  copyId?: string;
  batchId?: string;
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
 * new rows immediately.
 *
 * Caller must pass a concrete collectionId — the inbox-default path doesn't
 * support optimistic because the inbox id isn't known from the add call.
 */
export function useBatchedAddCopies(callbacks?: BatchedAddCallbacks) {
  const copiesCollection = useCopiesCollection();
  const addCopies = useAddCopies();
  const queryClient = useQueryClient();
  const userId = useUserId();
  // useBatcher captures its handler once; ref keeps callbacks current without
  // recreating it. Updated in an effect, not during render, to satisfy React Compiler.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const batcher = useBatcher<PendingAdd>(
    (pending) => {
      const printingIds = pending.map((entry) => entry.printingId);
      const batchIds = new Set(pending.map((entry) => entry.batchId));
      const shared = batchIds.size === 1 ? [...batchIds][0] : undefined;
      addCopies.mutate(
        {
          batchId: shared,
          copies: pending.map((entry) => ({
            id: entry.copyId,
            printingId: entry.printingId,
            collectionId: entry.collectionId,
          })),
          tempIds: pending
            .filter((entry) => entry.copyId === undefined)
            .map((entry) => entry.rowId),
          clientIds: pending
            .filter((entry) => entry.copyId !== undefined)
            .map((entry) => entry.rowId),
        },
        {
          onSuccess: (data) => {
            for (const [i, entry] of pending.entries()) {
              const result = data[i];
              if (result) {
                entry.resolve(result);
              } else {
                entry.reject(new Error("Add copies returned fewer results than requested"));
              }
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

  const add = (
    printingId: string,
    collectionId: string,
    copyId?: string,
    batchId?: string,
  ): { rowId: string; result: Promise<AddCopyResult> } => {
    const rowId = copyId ?? `${TEMP_COPY_ID_PREFIX}${randomUuid()}`;
    if (copiesCollection) {
      const groupId = userId ? groupIdForCollection(queryClient, userId, collectionId) : null;
      copiesCollection.utils.writeUpsert([
        {
          id: rowId,
          printingId,
          collectionId,
          groupId,
          ...EMPTY_COPY_METADATA,
          onLoan: false,
          reserved: false,
        },
      ]);
    }
    // oxlint-disable-next-line promise/avoid-new -- deferred pattern needed to batch individual calls into one POST
    const result = new Promise<AddCopyResult>((resolve, reject) => {
      batcher.addItem({ printingId, collectionId, rowId, copyId, batchId, resolve, reject });
    });
    return { rowId, result };
  };

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
      // Temp rows are left alone, not deleted: deleting risks a swap-after-delete
      // race where the add later re-inserts a row the user thought they removed.
      const realCopyIds = copyIds.filter((id) => !isTempCopyId(id));
      if (realCopyIds.length === 0) {
        throw new Error(STILL_ADDING_ERROR_MESSAGE);
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
            // Confirm each chunk immediately so a later chunk's failure only rolls
            // back the not-yet-committed remainder.
            collection.utils.writeDelete(batch);
          }
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all(userId),
            refetchType: "none",
          });
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
