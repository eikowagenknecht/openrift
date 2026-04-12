import type {
  CollectionListResponse,
  CopyCollectionBreakdownEntry,
  CopyCollectionBreakdownResponse,
  CopyListResponse,
  CopyResponse,
} from "@openrift/shared";
import { useMutation, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import type { CopiesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const BATCH_SIZE = 500;

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const fetchCopies = createServerFn({ method: "GET" })
  .inputValidator((input: { collectionId?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<CopiesResponse> => {
    const url = data.collectionId
      ? `${API_URL}/api/v1/collections/${encodeURIComponent(data.collectionId)}/copies`
      : `${API_URL}/api/v1/copies`;
    const res = await fetch(url, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Copies fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CopiesResponse>;
  });

export function copiesQueryOptions(collectionId?: string) {
  return queryOptions({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () => fetchCopies({ data: { collectionId } }),
    select: (data: CopyListResponse) => data.items,
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

interface OwnedBreakdownChange {
  printingId: string;
  collectionId: string;
  delta: number;
}

function updateOwnedBreakdown(
  queryClient: ReturnType<typeof useQueryClient>,
  changes: OwnedBreakdownChange[],
) {
  queryClient.setQueryData<CopyCollectionBreakdownResponse>(queryKeys.ownedCount.all, (old) => {
    if (!old) {
      return old;
    }
    const collections = queryClient.getQueryData<CollectionListResponse>(queryKeys.collections.all);
    const collectionNameById = new Map<string, string>(
      collections?.items.map((col) => [col.id, col.name]),
    );

    const working: Record<string, CopyCollectionBreakdownEntry[]> = {};
    for (const [printingId, entries] of Object.entries(old.items)) {
      working[printingId] = entries.map((entry) => ({ ...entry }));
    }

    for (const { printingId, collectionId, delta } of changes) {
      const entries = (working[printingId] ??= []);
      const existing = entries.find((entry) => entry.collectionId === collectionId);
      if (existing) {
        existing.count += delta;
      } else if (delta > 0) {
        entries.push({
          collectionId,
          collectionName: collectionNameById.get(collectionId) ?? "",
          count: delta,
        });
      }
    }

    const items: Record<string, CopyCollectionBreakdownEntry[]> = {};
    for (const [printingId, entries] of Object.entries(working)) {
      const filtered = entries.filter((entry) => entry.count > 0);
      if (filtered.length > 0) {
        items[printingId] = filtered;
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

const addCopiesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { copies: { printingId: string; collectionId?: string }[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/copies`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Add copies failed: ${res.status}`);
    }
    return res.json() as Promise<AddCopyResult[]>;
  });

export function useAddCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      copies: { printingId: string; collectionId?: string }[];
    }): Promise<AddCopyResult[]> => addCopiesFn({ data: body }),
    onSuccess: (data) => {
      const now = new Date().toISOString();
      const newCopies: CopyResponse[] = data.map((item) => ({
        id: item.id,
        printingId: item.printingId,
        collectionId: item.collectionId,
        createdAt: now,
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

      // Update owned breakdown
      updateOwnedBreakdown(
        queryClient,
        data.map((item) => ({
          printingId: item.printingId,
          collectionId: item.collectionId,
          delta: 1,
        })),
      );

      // Update collection copy counts
      const collectionDeltas = new Map<string, number>();
      for (const item of data) {
        collectionDeltas.set(item.collectionId, (collectionDeltas.get(item.collectionId) ?? 0) + 1);
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);
    },
  });
}

const moveCopiesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { copyIds: string[]; toCollectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/copies/move`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Move copies failed: ${res.status}`);
    }
  });

export function useMoveCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { copyIds: string[]; toCollectionId: string }) => {
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        await moveCopiesFn({ data: { copyIds: batch, toCollectionId: body.toCollectionId } });
      }
    },
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: queryKeys.copies.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.collections.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.ownedCount.all });

      // Snapshot for rollback
      const prevCopies = queryClient.getQueryData<CopyListResponse>(queryKeys.copies.all);
      const prevCollections = queryClient.getQueryData<CollectionListResponse>(
        queryKeys.collections.all,
      );
      const prevOwnedBreakdown = queryClient.getQueryData<CopyCollectionBreakdownResponse>(
        queryKeys.ownedCount.all,
      );

      // Find the copies being moved to determine source collections
      const copyIdSet = new Set(variables.copyIds);
      const movedCopies = prevCopies?.items.filter((copy) => copyIdSet.has(copy.id)) ?? [];

      // Update copies cache: change collectionId on moved copies (global)
      const updateCollectionId = (old: CopyListResponse | undefined) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          items: old.items.map((copy) =>
            copyIdSet.has(copy.id) ? { ...copy, collectionId: variables.toCollectionId } : copy,
          ),
        };
      };
      queryClient.setQueryData<CopyListResponse>(queryKeys.copies.all, updateCollectionId);

      // Update collection copy counts and owned breakdown (per-printing per-collection shift)
      const collectionDeltas = new Map<string, number>();
      const breakdownChanges: OwnedBreakdownChange[] = [];
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
          breakdownChanges.push(
            { printingId: copy.printingId, collectionId: copy.collectionId, delta: -1 },
            {
              printingId: copy.printingId,
              collectionId: variables.toCollectionId,
              delta: 1,
            },
          );
        }
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);
      updateOwnedBreakdown(queryClient, breakdownChanges);

      // Optimistically update per-collection caches (source: remove, target: add)
      const sourceCollections = new Set(movedCopies.map((copy) => copy.collectionId));
      const allAffectedCollections = new Set([...sourceCollections, variables.toCollectionId]);
      const prevByCollection = new Map<string, CopyListResponse | undefined>();
      for (const colId of allAffectedCollections) {
        prevByCollection.set(
          colId,
          queryClient.getQueryData<CopyListResponse>(queryKeys.copies.byCollection(colId)),
        );
      }
      const removeMoved = (old: CopyListResponse | undefined) => {
        if (!old) {
          return old;
        }
        return { ...old, items: old.items.filter((copy) => !copyIdSet.has(copy.id)) };
      };
      for (const colId of sourceCollections) {
        queryClient.setQueryData<CopyListResponse>(
          queryKeys.copies.byCollection(colId),
          removeMoved,
        );
      }
      queryClient.setQueryData<CopyListResponse>(
        queryKeys.copies.byCollection(variables.toCollectionId),
        (old) => {
          if (!old) {
            return old;
          }
          const updatedCopies = movedCopies.map((copy) => ({
            ...copy,
            collectionId: variables.toCollectionId,
          }));
          return { ...old, items: [...old.items, ...updatedCopies] };
        },
      );

      return { prevCopies, prevCollections, prevOwnedBreakdown, prevByCollection };
    },
    onError: (_error, _variables, context) => {
      if (context?.prevCopies) {
        queryClient.setQueryData(queryKeys.copies.all, context.prevCopies);
      }
      if (context?.prevCollections) {
        queryClient.setQueryData(queryKeys.collections.all, context.prevCollections);
      }
      if (context?.prevOwnedBreakdown) {
        queryClient.setQueryData(queryKeys.ownedCount.all, context.prevOwnedBreakdown);
      }
      if (context?.prevByCollection) {
        for (const [colId, data] of context.prevByCollection) {
          queryClient.setQueryData(queryKeys.copies.byCollection(colId), data);
        }
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

const disposeCopiesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/copies/dispose`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Dispose copies failed: ${res.status}`);
    }
  });

export function useDisposeCopies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { copyIds: string[] }) => {
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        await disposeCopiesFn({ data: { copyIds: batch } });
      }
    },
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: queryKeys.copies.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.collections.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.ownedCount.all });

      // Snapshot for rollback
      const prevCopies = queryClient.getQueryData<CopyListResponse>(queryKeys.copies.all);
      const prevOwnedBreakdown = queryClient.getQueryData<CopyCollectionBreakdownResponse>(
        queryKeys.ownedCount.all,
      );
      const prevCollections = queryClient.getQueryData<CollectionListResponse>(
        queryKeys.collections.all,
      );

      // Find copies being deleted
      const copyIdSet = new Set(variables.copyIds);
      const deletedCopies = prevCopies?.items.filter((copy) => copyIdSet.has(copy.id)) ?? [];

      // Remove from copies cache (global + per-collection)
      const removeCopy = (old: CopyListResponse | undefined) => {
        if (!old) {
          return old;
        }
        return { ...old, items: old.items.filter((copy) => !copyIdSet.has(copy.id)) };
      };
      const affectedCollections = new Set(deletedCopies.map((copy) => copy.collectionId));
      const prevByCollection = new Map<string, CopyListResponse | undefined>();
      for (const colId of affectedCollections) {
        prevByCollection.set(
          colId,
          queryClient.getQueryData<CopyListResponse>(queryKeys.copies.byCollection(colId)),
        );
      }
      queryClient.setQueryData<CopyListResponse>(queryKeys.copies.all, removeCopy);
      for (const colId of affectedCollections) {
        queryClient.setQueryData<CopyListResponse>(
          queryKeys.copies.byCollection(colId),
          removeCopy,
        );
      }

      // Update owned breakdown (decrement each printing/collection pair)
      updateOwnedBreakdown(
        queryClient,
        deletedCopies.map((copy) => ({
          printingId: copy.printingId,
          collectionId: copy.collectionId,
          delta: -1,
        })),
      );

      // Update collection copy counts (decrement)
      const collectionDeltas = new Map<string, number>();
      for (const copy of deletedCopies) {
        collectionDeltas.set(copy.collectionId, (collectionDeltas.get(copy.collectionId) ?? 0) - 1);
      }
      updateCollectionCopyCounts(queryClient, collectionDeltas);

      return { prevCopies, prevOwnedBreakdown, prevCollections, prevByCollection };
    },
    onError: (_error, _variables, context) => {
      if (context?.prevCopies) {
        queryClient.setQueryData(queryKeys.copies.all, context.prevCopies);
      }
      if (context?.prevOwnedBreakdown) {
        queryClient.setQueryData(queryKeys.ownedCount.all, context.prevOwnedBreakdown);
      }
      if (context?.prevCollections) {
        queryClient.setQueryData(queryKeys.collections.all, context.prevCollections);
      }
      if (context?.prevByCollection) {
        for (const [colId, data] of context.prevByCollection) {
          queryClient.setQueryData(queryKeys.copies.byCollection(colId), data);
        }
      }
    },
  });
}
