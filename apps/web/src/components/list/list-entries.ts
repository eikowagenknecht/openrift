import type { ListEntryDetailResponse, ListKind, Printing } from "@openrift/shared";

/** @returns The view mode that matches a list's kind. */
export function kindToView(kind: ListKind): "cards" | "printings" | "copies" {
  if (kind === "card") {
    return "cards";
  }
  if (kind === "printing") {
    return "printings";
  }
  return "copies";
}

/**
 * Resolves list entries to a deduped array of Printings (so useCardData can
 * filter/sort them like any catalog) plus a per-printing entries map. The
 * entries-per-printing list is used in copies view to expand one tile per
 * entry, and in non-copies view to find the first entry for Remove actions.
 * @returns The deduped Printing[] and an entries-by-printing map.
 */
export function collectListPrintings(
  entries: readonly ListEntryDetailResponse[],
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): {
  listPrintings: Printing[];
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>;
} {
  const listPrintings: Printing[] = [];
  const entriesByPrintingId = new Map<string, ListEntryDetailResponse[]>();
  for (const entry of entries) {
    const printing = resolveEntryPrinting(entry, printingsById, printingsByCardId);
    if (!printing) {
      continue;
    }
    const existing = entriesByPrintingId.get(printing.id);
    if (existing) {
      existing.push(entry);
      continue;
    }
    listPrintings.push(printing);
    entriesByPrintingId.set(printing.id, [entry]);
  }
  return { listPrintings, entriesByPrintingId };
}

/**
 * Picks the printing to render / drive the catalog pipeline for an entry.
 * Printing and copy variants carry their own `printingId` (for copy it's the
 * underlying printing of the physical copy). Card variants fall back to the
 * card's first known printing — "any printing acceptable".
 * @returns The Printing or undefined when nothing resolves.
 */
export function resolveEntryPrinting(
  entry: ListEntryDetailResponse,
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): Printing | undefined {
  switch (entry.kind) {
    case "printing":
    case "copy": {
      return printingsById[entry.printingId];
    }
    case "card": {
      return printingsByCardId.get(entry.cardId)?.[0];
    }
  }
}
