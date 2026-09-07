import type { MatchedEntry } from "@/lib/import-matcher";

export type ImportBucket = "ready" | "to-verify" | "need-attention";

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

export function getImportBucket(entry: MatchedEntry): ImportBucket {
  return classifyBucket(entry.status, entry.resolvedPrinting !== null);
}

export interface IndexedMatchedEntry {
  entry: MatchedEntry;
  index: number;
}

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

export interface ImportSummary {
  readyCount: number;
  toVerifyCount: number;
  needsAttentionCount: number;
  importableCount: number;
  totalCards: number;
}

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
