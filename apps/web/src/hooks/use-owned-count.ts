import type { CopyCollectionBreakdownEntry, CopyResponse, Finish } from "@openrift/shared";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";

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
  const copiesCollection = useCopiesCollection();

  // Returning null from queryFn disables the live query; when disabled
  // nothing subscribes to the copies collection, so its queryFn never fires.
  // This preserves the public /cards page's behavior for logged-out users
  // (the copies endpoint requires auth) — and during sign-out, the collection
  // becomes null an instant before the consumer rerenders with `enabled=false`,
  // which the null check below handles silently.
  const { data: copies } = useLiveQuery(
    (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [enabled, copiesCollection],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateTotals(copies) };
}

/**
 * Splits owned copies into deck-building-available and locked-away buckets,
 * based on each copy's collection `availableForDeckbuilding` flag.
 * @returns Both maps keyed by printingId, or undefined when disabled or still loading.
 */
export function useDeckBuildingCounts(enabled: boolean): {
  data:
    | {
        /** Per-printing counts in collections marked as available for deck building. */
        available: Record<string, number>;
        /** Per-printing counts in collections excluded from deck building (locked away). */
        locked: Record<string, number>;
      }
    | undefined;
} {
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  const { data: copies } = useLiveQuery(
    (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [enabled, copiesCollection],
  );

  if (!enabled || !copies || !collections) {
    return { data: undefined };
  }

  const availabilityById = new Map<string, boolean>();
  for (const col of collections) {
    availabilityById.set(col.id, col.availableForDeckbuilding);
  }

  const available: Record<string, number> = {};
  const locked: Record<string, number> = {};
  for (const copy of copies) {
    // Default to available when the collection is unknown (race during create
    // or stale collections cache) — better to count an in-flight copy than to
    // mis-flag it as locked.
    const isAvailable = availabilityById.get(copy.collectionId) ?? true;
    const bucket = isAvailable ? available : locked;
    bucket[copy.printingId] = (bucket[copy.printingId] ?? 0) + 1;
  }

  return { data: { available, locked } };
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
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  const { data: copies } = useLiveQuery(
    (q) =>
      enabled && copiesCollection
        ? q.from({ copy: copiesCollection }).where(({ copy }) => eq(copy.printingId, printingId))
        : null,
    [printingId, enabled, copiesCollection],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByCollection(copies, nameById) };
}

/** Minimal printing info needed to label and group an owned-by-variant breakdown. */
export interface OwnedBreakdownVariant {
  id: string;
  shortCode: string;
  finish: Finish;
}

/** Per-variant breakdown entry: variant identity plus its non-empty per-collection counts. */
interface VariantCollectionBreakdownEntry {
  printingId: string;
  shortCode: string;
  finish: Finish;
  collections: CopyCollectionBreakdownEntry[];
}

export function aggregateByVariant(
  copies: readonly CopyResponse[],
  variants: readonly OwnedBreakdownVariant[],
  collectionNameById: Map<string, string>,
): VariantCollectionBreakdownEntry[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const variant of variants) {
    buckets.set(variant.id, new Map());
  }
  for (const copy of copies) {
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

/**
 * Per-variant owned-collection breakdown for a set of sibling printings (same card).
 * @returns One entry per variant that has at least one owned copy, in input order.
 */
export function useOwnedCollectionsByVariants(
  variants: readonly OwnedBreakdownVariant[],
  enabled: boolean,
): { data: VariantCollectionBreakdownEntry[] | undefined } {
  const userId = useUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });

  // Filter in JS — expressing "printingId in [array]" as a symbolic .where()
  // clause would need per-id or() composition, and the set typically has a
  // few entries. Perf is dominated by mutation propagation, not the filter.
  const variantKey = variants.map((variant) => variant.id).join(",");
  const { data: copies } = useLiveQuery(
    (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [variantKey, enabled, copiesCollection],
  );

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByVariant(copies, variants, nameById) };
}
