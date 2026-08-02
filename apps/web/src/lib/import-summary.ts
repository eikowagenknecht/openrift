import type { MatchedEntry } from "@/lib/import-matcher";

/**
 * Which review bucket a matched import row falls into, used for both the
 * per-row status icon and the summary counts so they always agree:
 *
 * - `ready` — an exact match; nothing to check.
 * - `to-verify` — resolved to a best-guess printing (e.g. a fuzzy name match)
 *   that the user should glance at, but which still imports.
 * - `need-attention` — no printing picked yet (ambiguous or no match); the user
 *   must act before this row can import.
 */
export type ImportBucket = "ready" | "to-verify" | "need-attention";

/**
 * Classifies a row into its review bucket from its match status and whether a
 * concrete target (printing or card) was resolved. An exact status is always
 * ready; any other status that nonetheless resolved to something is a
 * best-guess to verify; an unresolved row needs attention. Shared by the
 * collection and deck importers, which carry different resolved fields.
 * @returns The review bucket.
 */
export function classifyBucket(
  status: "exact" | "needs-review" | "unresolved",
  hasResolved: boolean,
): ImportBucket {
  if (status === "exact") {
    return "ready";
  }
  if (hasResolved) {
    return "to-verify";
  }
  return "need-attention";
}

/**
 * Classifies a matched collection-import entry into its review bucket.
 * @returns The entry's review bucket.
 */
export function getImportBucket(entry: MatchedEntry): ImportBucket {
  return classifyBucket(entry.status, entry.resolvedPrinting !== null);
}

/** A matched entry paired with its position in the parsed list. */
export interface IndexedMatchedEntry {
  entry: MatchedEntry;
  index: number;
}

/**
 * Splits matched entries into the two groups the preview renders separately:
 * exact matches, which fold away, and everything else, which stays visible
 * because it may need action. Indices are the original positions, since every
 * row callback (skip, resolve, expand) addresses entries by index.
 * @returns The problematic and exact entries, each in original order.
 */
export function partitionMatchedEntries(entries: readonly MatchedEntry[]): {
  problematicEntries: IndexedMatchedEntry[];
  exactEntries: IndexedMatchedEntry[];
} {
  const problematicEntries: IndexedMatchedEntry[] = [];
  const exactEntries: IndexedMatchedEntry[] = [];

  for (const [index, entry] of entries.entries()) {
    if (entry.status === "exact") {
      exactEntries.push({ entry, index });
    } else {
      problematicEntries.push({ entry, index });
    }
  }

  return { problematicEntries, exactEntries };
}

/** Aggregate counts driving the import preview's summary badges and button. */
export interface ImportSummary {
  /** Exact matches. */
  readyCount: number;
  /** Best-guess rows that import but are worth a glance. */
  toVerifyCount: number;
  /** Rows with no resolved printing; skipped on import until resolved. */
  needsAttentionCount: number;
  /** Rows that will actually import (ready + to-verify), excluding skipped. */
  importableCount: number;
  /** Sum of quantities across the importable rows. */
  totalCards: number;
}

/**
 * Summarizes matched entries into the buckets the preview shows. Skipped rows
 * are excluded from every count. `importableCount`/`totalCards` cover the rows
 * that will import (anything with a resolved printing), which is the union of
 * the ready and to-verify buckets.
 * @returns The aggregate import summary.
 */
export function summarizeMatchedEntries(
  entries: readonly MatchedEntry[],
  skippedIndices: ReadonlySet<number>,
): ImportSummary {
  let readyCount = 0;
  let toVerifyCount = 0;
  let needsAttentionCount = 0;
  let importableCount = 0;
  let totalCards = 0;

  for (const [index, entry] of entries.entries()) {
    if (skippedIndices.has(index)) {
      continue;
    }
    const bucket = getImportBucket(entry);
    if (bucket === "ready") {
      readyCount++;
    } else if (bucket === "to-verify") {
      toVerifyCount++;
    } else {
      needsAttentionCount++;
    }
    if (entry.resolvedPrinting) {
      importableCount++;
      totalCards += entry.entry.quantity;
    }
  }

  return { readyCount, toVerifyCount, needsAttentionCount, importableCount, totalCards };
}
