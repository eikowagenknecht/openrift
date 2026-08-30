/**
 * The subset of a list entry (ADR-034) needed to merge copy-kind entries into
 * one per printing. Mirrors the discriminant of both `ListEntryRow` (api) and
 * `ListEntryDetailResponse` (web): a card-kind entry carries `cardId` and no
 * `printingId`, the printing and copy kinds the reverse.
 */
export type MergeableListEntry =
  | { kind: "card"; cardId: string; quantity: number }
  | { kind: "printing" | "copy"; printingId: string; quantity: number };

/**
 * Collapses copy-kind entries (one per physical copy) into one entry per
 * printing, summing quantities — a trade binder shows one tile "3× Cleave",
 * not three.
 *
 * @returns One entry per distinct target, first-seen fields kept aside from `quantity`.
 */
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
