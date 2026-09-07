/**
 * Mirrors the discriminant of `ListEntryRow` (api) and
 * `ListEntryDetailResponse` (web); keep the three in sync.
 */
export type MergeableListEntry =
  | { kind: "card"; cardId: string; quantity: number }
  | { kind: "printing" | "copy"; printingId: string; quantity: number };

export function mergeListEntriesByTarget<T extends MergeableListEntry>(entries: readonly T[]): T[] {
  const byTarget = new Map<string, T>();
  for (const entry of entries) {
    // Key on the target id, not the entry id — rule-only entries have a null
    // entry id, which would collapse them all onto one bucket.
    const key = entry.kind === "card" ? entry.cardId : entry.printingId;
    const existing = byTarget.get(key);
    byTarget.set(
      key,
      existing ? { ...existing, quantity: existing.quantity + entry.quantity } : entry,
    );
  }
  return [...byTarget.values()];
}
