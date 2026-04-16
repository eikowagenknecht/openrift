import type { CopyCollectionBreakdownEntry, CopyResponse } from "@openrift/shared";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { getCopiesCollection } from "@/lib/copies-collection";

function aggregateTotals(copies: readonly CopyResponse[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const copy of copies) {
    totals[copy.printingId] = (totals[copy.printingId] ?? 0) + 1;
  }
  return totals;
}

export function useOwnedCount(enabled: boolean): {
  data: Record<string, number> | undefined;
} {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

  // Returning null from queryFn disables the live query; when disabled
  // nothing subscribes to the copies collection, so its queryFn never fires.
  // This preserves the public /cards page's behavior for logged-out users
  // (the copies endpoint requires auth).
  const { data: copies } = useLiveQuery(
    (q) => (enabled ? q.from({ copy: copiesCollection }) : null),
    [enabled],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateTotals(copies) };
}

function aggregateByCollection(
  copies: readonly CopyResponse[],
  collectionNameById: Map<string, string>,
): CopyCollectionBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const copy of copies) {
    counts.set(copy.collectionId, (counts.get(copy.collectionId) ?? 0) + 1);
  }
  const result: CopyCollectionBreakdownEntry[] = [];
  for (const [collectionId, count] of counts) {
    result.push({
      collectionId,
      collectionName: collectionNameById.get(collectionId) ?? "",
      count,
    });
  }
  return result;
}

export function useOwnedCollections(
  printingId: string,
  enabled: boolean,
): { data: CopyCollectionBreakdownEntry[] | undefined } {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);
  const { data: collections } = useQuery({ ...collectionsQueryOptions, enabled });

  const { data: copies } = useLiveQuery(
    (q) =>
      enabled
        ? q.from({ copy: copiesCollection }).where(({ copy }) => eq(copy.printingId, printingId))
        : null,
    [printingId, enabled],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByCollection(copies, nameById) };
}

/**
 * Aggregates owned-collection breakdown across multiple printings of the same card.
 * @returns Merged per-collection entries with summed counts.
 */
export function useOwnedCollectionsByPrintings(
  printingIds: string[],
  enabled: boolean,
): { data: CopyCollectionBreakdownEntry[] | undefined } {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);
  const { data: collections } = useQuery({ ...collectionsQueryOptions, enabled });

  // Filter in JS — expressing "printingId in [array]" as a symbolic .where()
  // clause would need per-id or() composition, and the set typically has a
  // few entries. Perf is dominated by mutation propagation, not the filter.
  const printingIdSet = new Set(printingIds);
  const { data: copies } = useLiveQuery(
    (q) => (enabled ? q.from({ copy: copiesCollection }) : null),
    [printingIds.join(","), enabled],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const filtered = copies.filter((c) => printingIdSet.has(c.printingId));
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByCollection(filtered, nameById) };
}
