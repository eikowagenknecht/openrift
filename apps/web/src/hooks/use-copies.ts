import type { CopyResponse } from "@openrift/shared";
import { createTransaction, eq, useLiveQuery } from "@tanstack/react-db";
import { useBatcher } from "@tanstack/react-pacer";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { trackEvent } from "@/lib/analytics";
import { getCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import { withTimeout } from "@/lib/with-timeout";

// Re-export for route loaders and direct useQuery consumers (collections
// detail/index/stats/import all import from here).
export { copiesQueryOptions } from "@/lib/copies-query";

const BATCH_SIZE = 500;

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
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

  const { data, isReady } = useLiveQuery(
    (q) => {
      const base = q.from({ copy: copiesCollection });
      return collectionId === undefined
        ? base
        : base.where(({ copy }) => eq(copy.collectionId, collectionId));
    },
    [collectionId],
  );

  return { data: data ?? [], isReady };
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

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
}

async function postJson(url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Network failures (offline, DNS, CORS) throw TypeError with a browser-
    // specific message. Normalize to something the toast can display
    // usefully.
    if (error instanceof TypeError) {
      // oxlint-disable-next-line unicorn/prefer-type-error -- this is a network failure, not a type check
      throw new Error("Can't reach the server — check your connection");
    }
    throw error;
  }
}

async function addCopiesApi(
  body: { copies: { printingId: string; collectionId?: string }[] },
  signal: AbortSignal,
): Promise<AddCopyResult[]> {
  const res = await postJson("/api/v1/copies", body, signal);
  if (!res.ok) {
    throw new Error(`Add copies failed: ${res.status}`);
  }
  return res.json() as Promise<AddCopyResult[]>;
}

async function moveCopiesApi(
  body: { copyIds: string[]; toCollectionId: string },
  signal: AbortSignal,
): Promise<void> {
  const res = await postJson("/api/v1/copies/move", body, signal);
  if (!res.ok) {
    throw new Error(`Move copies failed: ${res.status}`);
  }
}

async function disposeCopiesApi(body: { copyIds: string[] }, signal: AbortSignal): Promise<void> {
  const res = await postJson("/api/v1/copies/dispose", body, signal);
  if (!res.ok) {
    throw new Error(`Dispose copies failed: ${res.status}`);
  }
}

export function useAddCopies() {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

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
          id: item.id,
          printingId: item.printingId,
          collectionId: item.collectionId,
        }));
        if (hasTempIds) {
          copiesCollection.utils.writeBatch(() => {
            copiesCollection.utils.writeDelete(tempIds);
            copiesCollection.utils.writeInsert(realRows);
          });
        } else {
          copiesCollection.utils.writeInsert(realRows);
        }
        // Mark the shared ["copies"] cache stale (without an eager refetch).
        // The collection's queryFn reads this cache via ensureQueryData, so
        // if it isn't invalidated, the next refetch (e.g. on network
        // reconnect) would hand back pre-mutation data and clobber our
        // writes to the synced store.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.copies.all,
          refetchType: "none",
        });
        trackEvent("collection-add", { count: apiResult.length });
        return apiResult;
      } catch (error) {
        if (hasTempIds) {
          copiesCollection.utils.writeDelete(tempIds);
        }
        throw error;
      }
    },
  });
}

export function useMoveCopies() {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      copyIds,
      toCollectionId,
    }: {
      copyIds: string[];
      toCollectionId: string;
    }) => {
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
          copiesCollection.utils.writeUpdate(
            ids.map((id) => ({ id, collectionId: toCollectionId })),
          );
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all,
            refetchType: "none",
          });
        },
      });
      tx.mutate(() => {
        for (const id of copyIds) {
          copiesCollection.update(id, (draft) => {
            draft.collectionId = toCollectionId;
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

export interface BatchedAddCallbacks {
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
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);
  const addCopies = useAddCopies();
  // useBatcher captures its handler once; ref keeps the latest callbacks
  // so we don't recreate the batcher whenever the consumer re-renders.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

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
      const tempId = `temp-${crypto.randomUUID()}`;
      copiesCollection.utils.writeInsert([{ id: tempId, printingId, collectionId }]);
      // oxlint-disable-next-line promise/avoid-new -- deferred pattern needed to batch individual calls into one POST
      const result = new Promise<AddCopyResult>((resolve, reject) => {
        batcher.addItem({ printingId, collectionId, tempId, resolve, reject });
      });
      return { tempId, result };
    },
    [copiesCollection, batcher],
  );

  return { add, isPending: addCopies.isPending };
}

export function useDisposeCopies() {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ copyIds }: { copyIds: string[] }) => {
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
          copiesCollection.utils.writeDelete(ids);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.copies.all,
            refetchType: "none",
          });
        },
      });
      tx.mutate(() => {
        for (const id of copyIds) {
          copiesCollection.delete(id);
        }
      });
      await tx.isPersisted.promise;
      trackEvent("collection-remove", { count: copyIds.length });
    },
  });
}
