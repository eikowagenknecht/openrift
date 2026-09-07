import type { DeckZone } from "@openrift/shared/types/enums";

import type { DeckMatchStatus, DeckMatchedEntry } from "@/lib/deck-import-matcher";

const STATUS_SORT_ORDER: Record<DeckMatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

export function deckImportRowId(index: number): string {
  return `deck-import-entry-${index}`;
}

function entryDisplayName(entry: DeckMatchedEntry): string {
  return (
    entry.resolvedCard?.cardName ??
    entry.entry.cardName ??
    entry.entry.shortCode ??
    ""
  ).toLowerCase();
}

export function sortDeckImportEntries(
  entries: readonly DeckMatchedEntry[],
  zoneOrder: readonly DeckZone[],
): DeckMatchedEntry[] {
  const zoneIndex = Object.fromEntries(zoneOrder.map((slug, index) => [slug, index]));
  return entries.toSorted((entryA, entryB) => {
    const zoneDiff = (zoneIndex[entryA.zone] ?? 99) - (zoneIndex[entryB.zone] ?? 99);
    if (zoneDiff !== 0) {
      return zoneDiff;
    }
    const nameA = entryDisplayName(entryA);
    const nameB = entryDisplayName(entryB);
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
    return STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
  });
}
