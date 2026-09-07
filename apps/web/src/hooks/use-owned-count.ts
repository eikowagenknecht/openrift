import type { CopyCollectionBreakdownEntry, CopyResponse, Finish } from "@openrift/shared";
import { eq, inArray, useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";

function aggregateTotals(copies: readonly CopyResponse[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const copy of copies) {
    // Group copies belong to the group, not the viewer; excluded from personal totals.
    if (copy.groupId !== null) {
      continue;
    }
    totals[copy.printingId] = (totals[copy.printingId] ?? 0) + 1;
  }
  return totals;
}

export function aggregateScopedCount(
  copies: readonly CopyResponse[],
  collectionId?: string,
): { count: number; totalCount: number } {
  let totalCount = 0;
  for (const copy of copies) {
    if (copy.groupId === null) {
      totalCount += 1;
    }
  }
  if (collectionId === undefined) {
    return { count: totalCount, totalCount };
  }
  let count = 0;
  for (const copy of copies) {
    if (copy.collectionId === collectionId) {
      count += 1;
    }
  }
  return { count, totalCount };
}

export function aggregateScopedTotals(
  copies: readonly CopyResponse[],
  printingIds: readonly string[],
  collectionId?: string,
): {
  totals: Record<string, number>;
  total: number;
  allTotals: Record<string, number>;
  allTotal: number;
} {
  const allTotals = aggregateTotals(copies);
  let allTotal = 0;
  for (const id of printingIds) {
    allTotal += allTotals[id] ?? 0;
  }
  if (collectionId === undefined) {
    return { totals: allTotals, total: allTotal, allTotals, allTotal };
  }
  const totals: Record<string, number> = {};
  for (const copy of copies) {
    if (copy.collectionId === collectionId) {
      totals[copy.printingId] = (totals[copy.printingId] ?? 0) + 1;
    }
  }
  let total = 0;
  for (const id of printingIds) {
    total += totals[id] ?? 0;
  }
  return { totals, total, allTotals, allTotal };
}

export function useOwnedCount(enabled: boolean): {
  data: Record<string, number> | undefined;
} {
  const copiesCollection = useCopiesCollection();

  // A null queryFn result disables the live query entirely, so it never subscribes
  // for a logged-out viewer (the copies endpoint requires auth).
  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateTotals(copies) };
}

export function useOwnedCountFor(
  printingId: string,
  enabled: boolean,
  collectionId?: string,
): { data: { count: number; totalCount: number } | undefined } {
  const copiesCollection = useCopiesCollection();

  const { data: copies } = useLiveQuery({
    query: (q) =>
      enabled && copiesCollection
        ? q.from({ copy: copiesCollection }).where(({ copy }) => eq(copy.printingId, printingId))
        : null,
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateScopedCount(copies, collectionId) };
}

export function useOwnedCountsForPrintings(
  printingIds: readonly string[],
  enabled: boolean,
  collectionId?: string,
): {
  data:
    | {
        totals: Record<string, number>;
        total: number;
        allTotals: Record<string, number>;
        allTotal: number;
      }
    | undefined;
} {
  const copiesCollection = useCopiesCollection();

  const { data: copies } = useLiveQuery({
    query: (q) =>
      enabled && copiesCollection && printingIds.length > 0
        ? q
            .from({ copy: copiesCollection })
            .where(({ copy }) => inArray(copy.printingId, [...printingIds]))
        : null,
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateScopedTotals(copies, printingIds, collectionId) };
}

export function useCopyRowsForPrintings(
  printingIds: readonly string[],
  enabled: boolean,
  collectionId?: string,
): { data: CopyResponse[] | undefined } {
  const copiesCollection = useCopiesCollection();
  const { data: copies } = useLiveQuery({
    query: (q) =>
      enabled && copiesCollection && printingIds.length > 0
        ? q
            .from({ copy: copiesCollection })
            .where(({ copy }) => inArray(copy.printingId, [...printingIds]))
        : null,
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const filtered =
    collectionId === undefined
      ? copies.filter((copy) => copy.groupId === null)
      : copies.filter((copy) => copy.collectionId === collectionId);
  return { data: filtered };
}

export interface DeckBuildingCounts {
  available: Record<string, number>;
  locked: Record<string, number>;
  lockedLoaned: Record<string, number>;
  lockedReserved: Record<string, number>;
  lockedExcluded: Record<string, number>;
}

export function aggregateDeckBuildingCounts(
  copies: readonly CopyResponse[],
  availabilityById: ReadonlyMap<string, boolean>,
  exemptCollectionId?: string | null,
): DeckBuildingCounts {
  const available: Record<string, number> = {};
  const locked: Record<string, number> = {};
  const lockedLoaned: Record<string, number> = {};
  const lockedReserved: Record<string, number> = {};
  const lockedExcluded: Record<string, number> = {};
  for (const copy of copies) {
    if (copy.onLoan) {
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedLoaned[copy.printingId] = (lockedLoaned[copy.printingId] ?? 0) + 1;
      continue;
    }
    if (copy.reserved) {
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedReserved[copy.printingId] = (lockedReserved[copy.printingId] ?? 0) + 1;
      continue;
    }
    // Unknown collection (create race / stale cache) defaults to available.
    const isAvailable =
      copy.collectionId === exemptCollectionId || (availabilityById.get(copy.collectionId) ?? true);
    if (isAvailable) {
      available[copy.printingId] = (available[copy.printingId] ?? 0) + 1;
    } else if (copy.groupId === null) {
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedExcluded[copy.printingId] = (lockedExcluded[copy.printingId] ?? 0) + 1;
    }
  }
  return { available, locked, lockedLoaned, lockedReserved, lockedExcluded };
}

export function useDeckBuildingCounts(
  enabled: boolean,
  exemptCollectionId?: string | null,
): {
  data: DeckBuildingCounts | undefined;
} {
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  if (!enabled || !copies || !collections) {
    return { data: undefined };
  }

  const availabilityById = new Map<string, boolean>();
  for (const col of collections) {
    availabilityById.set(col.id, col.availableForDeckbuilding);
  }

  return { data: aggregateDeckBuildingCounts(copies, availabilityById, exemptCollectionId) };
}

function aggregateByCollection(
  copies: readonly CopyResponse[],
  collectionNameById: Map<string, string>,
): CopyCollectionBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const copy of copies) {
    if (copy.groupId !== null) {
      continue;
    }
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
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  const { data: copies } = useLiveQuery({
    query: (q) =>
      enabled && copiesCollection
        ? q.from({ copy: copiesCollection }).where(({ copy }) => eq(copy.printingId, printingId))
        : null,
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByCollection(copies, nameById) };
}

export interface OwnedBreakdownVariant {
  id: string;
  shortCode: string;
  finish: Finish;
}

export interface VariantCollectionBreakdownEntry {
  printingId: string;
  shortCode: string;
  finish: Finish;
  collections: CopyCollectionBreakdownEntry[];
}

export function aggregateByVariant(
  copies: readonly CopyResponse[],
  variants: readonly OwnedBreakdownVariant[],
  collectionNameById: Map<string, string>,
  viewCollectionId?: string,
): VariantCollectionBreakdownEntry[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const variant of variants) {
    buckets.set(variant.id, new Map());
  }
  for (const copy of copies) {
    if (copy.groupId !== null && copy.collectionId !== viewCollectionId) {
      continue;
    }
    const bucket = buckets.get(copy.printingId);
    if (!bucket) {
      continue;
    }
    bucket.set(copy.collectionId, (bucket.get(copy.collectionId) ?? 0) + 1);
  }
  const result: VariantCollectionBreakdownEntry[] = [];
  for (const variant of variants) {
    const bucket = buckets.get(variant.id);
    if (!bucket || bucket.size === 0) {
      continue;
    }
    const collections: CopyCollectionBreakdownEntry[] = [];
    for (const [collectionId, count] of bucket) {
      collections.push({
        collectionId,
        collectionName: collectionNameById.get(collectionId) ?? "",
        count,
      });
    }
    result.push({
      printingId: variant.id,
      shortCode: variant.shortCode,
      finish: variant.finish,
      collections,
    });
  }
  return result;
}

export function useOwnedCollectionsByVariants(
  variants: readonly OwnedBreakdownVariant[],
  enabled: boolean,
  viewCollectionId?: string,
): { data: VariantCollectionBreakdownEntry[] | undefined } {
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByVariant(copies, variants, nameById, viewCollectionId) };
}
