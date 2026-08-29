import type { CopyCollectionBreakdownEntry, CopyResponse, Finish } from "@openrift/shared";
import { eq, inArray, useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";

function aggregateTotals(copies: readonly CopyResponse[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const copy of copies) {
    // Global "owned" totals count personal copies only — copies in group
    // collections belong to the group, not the viewer, so they must not
    // inflate the viewer's owned badges. Collection-scoped counts (keyed by
    // collectionId below) still include every copy in that collection.
    if (copy.groupId !== null) {
      continue;
    }
    totals[copy.printingId] = (totals[copy.printingId] ?? 0) + 1;
  }
  return totals;
}

/**
 * Reduce a list of copies for a single printing into the displayed count
 * (in-collection when `collectionId` is set, otherwise global) plus the global
 * figure.
 * @returns `{ count, totalCount }`. Both equal when no `collectionId` is supplied.
 */
export function aggregateScopedCount(
  copies: readonly CopyResponse[],
  collectionId?: string,
): { count: number; totalCount: number } {
  // Global figure = personal copies only (group copies aren't the viewer's).
  let totalCount = 0;
  for (const copy of copies) {
    if (copy.groupId === null) {
      totalCount += 1;
    }
  }
  if (collectionId === undefined) {
    return { count: totalCount, totalCount };
  }
  // In-collection figure includes every copy in that collection (personal or
  // group), since the viewer is looking at that specific collection.
  let count = 0;
  for (const copy of copies) {
    if (copy.collectionId === collectionId) {
      count += 1;
    }
  }
  return { count, totalCount };
}

/**
 * Reduce a list of copies for a sibling set into per-printing + summed
 * totals, both in-scope (limited to `collectionId` when set) and global.
 * @returns Scoped + global per-printing maps and matching summed totals.
 */
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

  // Returning null from queryFn disables the live query; when disabled
  // nothing subscribes to the copies collection, so its queryFn never fires.
  // This preserves the public /cards page's behavior for logged-out users
  // (the copies endpoint requires auth) — and during sign-out, the collection
  // becomes null an instant before the consumer rerenders with `enabled=false`,
  // which the null check below handles silently.
  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  return { data: aggregateTotals(copies) };
}

/**
 * Per-printing owned count, scoped to a single printingId via a `where` filter.
 * Lets each row in a virtualized list subscribe to just its own count, so
 * adding or removing a copy only re-renders the row that owns that printing.
 * The map-wide variant {@link useOwnedCount} above re-fires every consumer on
 * any copy mutation.
 *
 * When `collectionId` is provided, `count` is restricted to that collection
 * and `totalCount` reports the global figure for the same printing. Without
 * a `collectionId`, both numbers are the global count.
 * @returns The scoped + global counts, or undefined when disabled or still loading.
 */
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

/**
 * Owned counts for a set of printings (same card siblings) via `inArray`.
 * Returns both per-printing totals and the summed total across the set, so
 * the caller can show one number and still ask whether multiple variants
 * have copies (for the cards-view "minus on ambiguous removal opens variant
 * popover" branch). Same per-row subscription rationale as
 * {@link useOwnedCountFor} — only re-fires when one of the listed siblings'
 * counts actually changes.
 *
 * When `collectionId` is provided, `totals`/`total` are restricted to that
 * collection and `allTotals`/`allTotal` report the global figures across all
 * collections. Without a `collectionId`, both pairs are identical.
 * @returns The scoped + global per-printing totals and sums, or undefined when
 *   disabled or still loading.
 */
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

/**
 * Full copy rows (including the ADR-038 metadata) for a set of printings.
 * Same live-query subscription shape as {@link useOwnedCountsForPrintings};
 * scoped to a collection when `collectionId` is set, otherwise personal
 * copies only. Lets a grid cell derive its copy IDs (drag/select wiring) and
 * its metadata badges from one per-cell subscription. Only re-fires when one
 * of the listed siblings' copies actually changes.
 *
 * @returns The scoped copy rows, or undefined when disabled or still loading.
 */
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
      ? // Global owned copies = personal copies only (group copies aren't the
        // viewer's). Scoped to a collection, include every copy in it.
        copies.filter((copy) => copy.groupId === null)
      : copies.filter((copy) => copy.collectionId === collectionId);
  return { data: filtered };
}

/** Per-printing copy counts split by deck-building availability. */
export interface DeckBuildingCounts {
  /** Per-printing counts in collections marked as available for deck building. */
  available: Record<string, number>;
  /**
   * Per-printing counts locked away from deck building, for any reason.
   * Equal to `lockedLoaned` + `lockedReserved` + `lockedExcluded` added
   * together per printing.
   */
  locked: Record<string, number>;
  /** Per-printing counts locked because the copy is out on loan (ADR-039). */
  lockedLoaned: Record<string, number>;
  /** Per-printing counts locked because the copy is reserved for a live outgoing trade (ADR-019). */
  lockedReserved: Record<string, number>;
  /** Per-printing counts locked because their collection is excluded from deck building. */
  lockedExcluded: Record<string, number>;
}

/**
 * Splits copies into deck-building-available and locked-away buckets, based on
 * each copy's collection availability. A copy in an excluded collection is
 * "locked", not "available" — the deck builder must not count it as owned.
 * The locked bucket also keeps a per-reason breakdown so callers (the missing
 * cards dialog) can say *why* a copy is locked instead of assuming every
 * locked copy sits in an excluded collection.
 *
 * `exemptCollectionId` is the home collection of the deck being built: the box
 * it physically lives in counts as available for that deck, whatever the
 * collection's deck-building flag says. Loans and trade reservations still
 * win — those copies aren't in the box.
 * @returns Per-printing `available` and `locked` count maps, plus the locked
 *   reason breakdown (`lockedLoaned`, `lockedReserved`, `lockedExcluded`).
 */
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
    // A copy out on a loan (ADR-039) is physically absent: never available,
    // whatever its collection's flag says. It is still owned, so it counts as
    // locked — lending only draws from personal collections, so no group check.
    if (copy.onLoan) {
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedLoaned[copy.printingId] = (lockedLoaned[copy.printingId] ?? 0) + 1;
      continue;
    }
    // A copy reserved for a live outgoing trade (ADR-019) is committed away:
    // owned but not buildable, so it's locked, not available. Reservations only
    // pin personal copies, so no group check here either.
    if (copy.reserved) {
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedReserved[copy.printingId] = (lockedReserved[copy.printingId] ?? 0) + 1;
      continue;
    }
    // Default to available when the collection is unknown (race during create
    // or stale collections cache) — better to count an in-flight copy than to
    // mis-flag it as locked. `availableForDeckbuilding` is viewer-effective:
    // personal collections default on, group collections are opt-in per member.
    const isAvailable =
      copy.collectionId === exemptCollectionId || (availabilityById.get(copy.collectionId) ?? true);
    if (isAvailable) {
      // Includes opted-in group copies — they feed the viewer's deck inventory.
      available[copy.printingId] = (available[copy.printingId] ?? 0) + 1;
    } else if (copy.groupId === null) {
      // "Locked away" means owned-but-excluded, which only applies to the
      // viewer's personal copies. Group copies the viewer hasn't opted into
      // aren't theirs, so they're neither available nor locked.
      locked[copy.printingId] = (locked[copy.printingId] ?? 0) + 1;
      lockedExcluded[copy.printingId] = (lockedExcluded[copy.printingId] ?? 0) + 1;
    }
  }
  return { available, locked, lockedLoaned, lockedReserved, lockedExcluded };
}

/**
 * Splits owned copies into deck-building-available and locked-away buckets,
 * based on each copy's collection `availableForDeckbuilding` flag.
 *
 * Pass the current deck's `collectionId` as `exemptCollectionId` so the box the
 * deck is stored in counts as available for it, even when that collection is
 * excluded from deck building. Omit it on surfaces that aren't scoped to one
 * deck (the catalog) or that measure someone else's deck against the viewer's
 * collection (the shared-deck page).
 * @returns Both maps keyed by printingId, or undefined when disabled or still loading.
 */
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
    // Owned breakdown = personal collections only (group copies aren't owned
    // by the viewer); consistent with the owned-count badges.
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

/** Minimal printing info needed to label and group an owned-by-variant breakdown. */
export interface OwnedBreakdownVariant {
  id: string;
  shortCode: string;
  finish: Finish;
}

/** Per-variant breakdown entry: variant identity plus its non-empty per-collection counts. */
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
): VariantCollectionBreakdownEntry[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const variant of variants) {
    buckets.set(variant.id, new Map());
  }
  for (const copy of copies) {
    // Owned breakdown = personal collections only (see aggregateByCollection).
    if (copy.groupId !== null) {
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
  const { data: copies } = useLiveQuery({
    query: (q) => (enabled && copiesCollection ? q.from({ copy: copiesCollection }) : null),
  });

  if (!enabled || !copies) {
    return { data: undefined };
  }
  const nameById = new Map((collections ?? []).map((col) => [col.id, col.name]));
  return { data: aggregateByVariant(copies, variants, nameById) };
}
