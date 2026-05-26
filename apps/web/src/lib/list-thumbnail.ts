import type { ListEntryDetailResponse, Printing } from "@openrift/shared";

/**
 * Resolve the thumbnail imageId for a list entry. `printing` and `copy`
 * entries carry their own `imageId` on the wire; `card` entries don't (the
 * server can't know which printing to surface), so we pick a representative
 * printing from the catalog. Falls back to the catalog when an
 * imageId-bearing entry is missing one.
 * @returns The imageId, or null when nothing resolves.
 */
export function resolveEntryImageId(
  entry: ListEntryDetailResponse,
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): string | null {
  if (entry.kind === "card") {
    const printing = printingsByCardId.get(entry.cardId)?.[0];
    return printing?.images[0]?.imageId ?? null;
  }
  if (entry.imageId) {
    return entry.imageId;
  }
  const printing = printingsById[entry.printingId];
  return printing?.images[0]?.imageId ?? null;
}
