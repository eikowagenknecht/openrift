import type { CollectionListResponse, CopyListResponse, CopyResponse } from "@openrift/shared";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

const BATCH_SIZE = 500;

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function copiesQueryOptions(collectionId?: string) {
  return queryOptions({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: async () => {
      if (collectionId) {
        const res = await client.api.v1.collections[":id"].copies.$get({
          param: { id: collectionId },
          query: {},
        });
        assertOk(res);
        return await res.json();
      }
      const res = await client.api.v1.copies.$get({ query: {} });
      assertOk(res);
      return await res.json();
    },
    select: (data) => data.items,
  });
}

export function useCopies(collectionId?: string) {
  return useSuspenseQuery(copiesQueryOptions(collectionId));
}

// ── Cache helpers ────────────────────────────────────────────────────────────

function appendCopiesToCache(
  updater: (old: CopyListResponse | undefined) => CopyListResponse | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
  collectionIds: Set<string>,
) {
  queryClient.setQueryData<CopyListResponse>(queryKeys.copies.all, updater);
  for (const colId of collectionIds) {
    queryClient.setQueryData<CopyListResponse>(queryKeys.copies.byCollection(colId), updater);
  }
}

function updateOwnedCounts(
  queryClient: ReturnType<typeof useQueryClient>,
  deltas: Map<string, number>,
) {
  queryClient.setQueryData<{ items: Record<string, number> }>(queryKeys.ownedCount.all, (old) => {
    if (!old) {
      return old;
    }
    const items: Record<string, number> = {};
    for (const [key, value] of Object.entries(old.items)) {
      const delta = deltas.get(key) ?? 0;
      const next = value + delta;
      if (next > 0) {
        items[key] = next;
      }
    }
    // Handle new printings not in old items
    for (const [printingId, delta] of deltas) {
      if (!(printingId in old.items) && delta > 0) {
        items[printingId] = delta;
      }
    }
    return { items };
  });
}

function updateCollectionCopyCounts(
  queryClient: ReturnType<typeof useQueryClient>,
  deltas: Map<string, number>,
) {
  queryClient.setQueryData<CollectionListResponse>(queryKeys.collections.all, (old) => {
    if (!old) {
      return old;
    }
    return {
      items: old.items.map((col) => {
        const delta = deltas.get(col.id);
        if (delta === undefined) {
          return col;
        }
        return { ...col, copyCount: col.copyCount + delta };
      }),
    };
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
}

export function useAddCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      copies: { printingId: string; collectionId?: string }[];
    }): Promise<AddCopyResult[]> => {
      const res = await client.api.v1.copies.$post({ json: body });
      assertOk(res);
      return (await res.json()) as AddCopyResult[];
    },
    onSuccess: (data) => {
      const now = new Date().toISOString();
      const newCopies: CopyResponse[] = data.map((item) => ({
        id: item.id,
        printingId: item.printingId,
        collectionId: item.collectionId,
        createdAt: now,
        updatedAt: now,
      }));

      // Update copies caches
      const collectionIds = new Set(data.map((item) => item.collectionId));
      appendCopiesToCache(
        (old) => {
          if (!old) {
            return old;
          }
          return { ...old, items: [...old.items, ...newCopies] };
        },
        queryClient,
        collectionIds,
      );

      // Update owned counts
      const printingDeltas = new Map<string, number>();
      for (const item of data) {
        printingDeltas.set(item.printingId, (printingDeltas.get(item.printingId) ?? 0) + 1);
      }
      updateOwnedCounts(queryClient, printingDeltas);

      // Update collection copy counts
      const collectionDeltas = new Map<string, number>();
      for (const item of data) {
        collectionDeltas.set(item.collectionId, (collectionDeltas.get(item.collectionId) ?? 0) + 1);
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);
    },
  });
}

export function useMoveCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { copyIds: string[]; toCollectionId: string }) => {
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        const res = await client.api.v1.copies.move.$post({
          json: { copyIds: batch, toCollectionId: body.toCollectionId },
        });
        assertOk(res);
      }
    },
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: queryKeys.copies.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.collections.all });

      // Snapshot for rollback
      const prevCopies = queryClient.getQueryData<CopyListResponse>(queryKeys.copies.all);
      const prevCollections = queryClient.getQueryData<CollectionListResponse>(
        queryKeys.collections.all,
      );

      // Find the copies being moved to determine source collections
      const copyIdSet = new Set(variables.copyIds);
      const movedCopies = prevCopies?.items.filter((copy) => copyIdSet.has(copy.id)) ?? [];

      // Update copies cache: change collectionId on moved copies
      queryClient.setQueryData<CopyListResponse>(queryKeys.copies.all, (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          items: old.items.map((copy) =>
            copyIdSet.has(copy.id) ? { ...copy, collectionId: variables.toCollectionId } : copy,
          ),
        };
      });

      // Update collection copy counts
      const collectionDeltas = new Map<string, number>();
      for (const copy of movedCopies) {
        if (copy.collectionId !== variables.toCollectionId) {
          collectionDeltas.set(
            copy.collectionId,
            (collectionDeltas.get(copy.collectionId) ?? 0) - 1,
          );
          collectionDeltas.set(
            variables.toCollectionId,
            (collectionDeltas.get(variables.toCollectionId) ?? 0) + 1,
          );
        }
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);

      // Invalidate per-collection caches (source and target)
      const affectedCollections = new Set([
        ...movedCopies.map((copy) => copy.collectionId),
        variables.toCollectionId,
      ]);
      for (const colId of affectedCollections) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.copies.byCollection(colId) });
      }

      return { prevCopies, prevCollections };
    },
    onError: (_error, _variables, context) => {
      if (context?.prevCopies) {
        queryClient.setQueryData(queryKeys.copies.all, context.prevCopies);
      }
      if (context?.prevCollections) {
        queryClient.setQueryData(queryKeys.collections.all, context.prevCollections);
      }
    },
  });
}

// ── Batched add ─────────────────────────────────────────────────────────────

const BATCH_DELAY = 300;

interface PendingAdd {
  printingId: string;
  collectionId?: string;
  resolve: (result: AddCopyResult) => void;
  reject: (error: unknown) => void;
}

/**
 * Batches rapid add-copy calls into a single POST request.
 * Each call returns a promise that resolves with the individual copy result.
 * Calls within a 300ms window are combined into one batch POST.
 * @returns An `add` function and `isPending` flag.
 */
export function useBatchedAddCopies() {
  const addCopies = useAddCopies();
  const pendingRef = useRef<PendingAdd[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    timerRef.current = null;

    if (pending.length === 0) {
      return;
    }

    addCopies.mutate(
      {
        copies: pending.map((entry) => ({
          printingId: entry.printingId,
          collectionId: entry.collectionId,
        })),
      },
      {
        onSuccess: (data) => {
          for (let i = 0; i < pending.length; i++) {
            pending[i].resolve(data[i]);
          }
        },
        onError: (error) => {
          for (const entry of pending) {
            entry.reject(error);
          }
        },
      },
    );
  }, [addCopies]);

  const add = useCallback(
    (printingId: string, collectionId?: string): Promise<AddCopyResult> =>
      // oxlint-disable-next-line promise/avoid-new -- deferred pattern needed to batch individual calls into one POST
      new Promise<AddCopyResult>((resolve, reject) => {
        pendingRef.current.push({ printingId, collectionId, resolve, reject });

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(flush, BATCH_DELAY);
      }),
    [flush],
  );

  return { add, isPending: addCopies.isPending };
}

export function useDisposeCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { copyIds: string[] }) => {
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        const res = await client.api.v1.copies.dispose.$post({ json: { copyIds: batch } });
        assertOk(res);
      }
    },
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: queryKeys.copies.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.collections.all });

      // Snapshot for rollback
      const prevCopies = queryClient.getQueryData<CopyListResponse>(queryKeys.copies.all);
      const prevOwnedCount = queryClient.getQueryData<{ items: Record<string, number> }>(
        queryKeys.ownedCount.all,
      );
      const prevCollections = queryClient.getQueryData<CollectionListResponse>(
        queryKeys.collections.all,
      );

      // Find copies being deleted
      const copyIdSet = new Set(variables.copyIds);
      const deletedCopies = prevCopies?.items.filter((copy) => copyIdSet.has(copy.id)) ?? [];

      // Remove from copies cache
      queryClient.setQueryData<CopyListResponse>(queryKeys.copies.all, (old) => {
        if (!old) {
          return old;
        }
        return { ...old, items: old.items.filter((copy) => !copyIdSet.has(copy.id)) };
      });

      // Invalidate affected per-collection caches
      const affectedCollections = new Set(deletedCopies.map((copy) => copy.collectionId));
      for (const colId of affectedCollections) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.copies.byCollection(colId) });
      }

      // Update owned counts (decrement)
      const printingDeltas = new Map<string, number>();
      for (const copy of deletedCopies) {
        printingDeltas.set(copy.printingId, (printingDeltas.get(copy.printingId) ?? 0) - 1);
      }
      updateOwnedCounts(queryClient, printingDeltas);

      // Update collection copy counts (decrement)
      const collectionDeltas = new Map<string, number>();
      for (const copy of deletedCopies) {
        collectionDeltas.set(copy.collectionId, (collectionDeltas.get(copy.collectionId) ?? 0) - 1);
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);

      return { prevCopies, prevOwnedCount, prevCollections };
    },
    onError: (_error, _variables, context) => {
      if (context?.prevCopies) {
        queryClient.setQueryData(queryKeys.copies.all, context.prevCopies);
      }
      if (context?.prevOwnedCount) {
        queryClient.setQueryData(queryKeys.ownedCount.all, context.prevOwnedCount);
      }
      if (context?.prevCollections) {
        queryClient.setQueryData(queryKeys.collections.all, context.prevCollections);
      }
    },
  });
}
