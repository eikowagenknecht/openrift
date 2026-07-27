import type { ListEntryDetailResponse, ListKind, Printing } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";

/**
 * Empty-state copy by kind. The "how to add" guidance is kind-specific —
 * copy-kind lists are filled from the collection grid's float-bar or by
 * dragging copies onto the list in the sidebar. Card and printing kinds can
 * also be filled by browsing the full catalog directly from this page (the
 * "Browse catalog" CTA), which flips the grid into add mode.
 * @returns The title/description for the empty state.
 */
export function emptyStateCopy(kind: ListKind): { title: string; description: string } {
  if (kind === "copy") {
    return {
      title: "No copies on this list yet",
      description:
        "Open a collection, select copies, and use the “Add to list” action to put them here.",
    };
  }
  if (kind === "printing") {
    return {
      title: "No printings on this list yet",
      description: "Browse the catalog to add printings, or drag copies onto the list.",
    };
  }
  return {
    title: "No cards on this list yet",
    description: "Browse the catalog to add cards, or drag copies onto the list.",
  };
}

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

/**
 * Builds the items array fed into the CardViewer plus a per-item entry
 * lookup. In copies view each entry gets its own tile (item.id = entry.id);
 * in cards/printings view entries collapse to one tile per printing.
 * @returns items + a map from item.id → entry.
 */
export function buildItems(
  view: "cards" | "printings" | "copies",
  sortedCards: Printing[],
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>,
): {
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
} {
  const items: CardViewerItem[] = [];
  const entryByItemId = new Map<string, ListEntryDetailResponse>();
  if (view === "copies") {
    for (const printing of sortedCards) {
      const entriesForPrinting = entriesByPrintingId.get(printing.id) ?? [];
      for (const entry of entriesForPrinting) {
        // One tile = one copy. Use the entry id when present, else the copyId
        // (rule-derived copy entries have no entry id; ADR-034).
        const itemId = entry.id ?? (entry.kind === "copy" ? entry.copyId : printing.id);
        items.push({ id: itemId, printing });
        entryByItemId.set(itemId, entry);
      }
    }
    return { items, entryByItemId };
  }
  for (const printing of sortedCards) {
    const first = entriesByPrintingId.get(printing.id)?.[0];
    items.push({ id: printing.id, printing });
    if (first) {
      entryByItemId.set(printing.id, first);
    }
  }
  return { items, entryByItemId };
}

/**
 * Items for add mode — one tile per printing in the (filtered) catalog,
 * with an empty entry-lookup map since most catalog tiles have no entry on
 * the list. The renderer reads quantities via the kind-keyed `entryByKey`
 * map instead.
 * @returns items + an empty entry-by-item-id map.
 */
export function buildItemsFromCatalog(sortedCards: Printing[]): {
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
} {
  const items: CardViewerItem[] = sortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));
  return { items, entryByItemId: new Map() };
}

/**
 * Keyed entry lookup for the add-mode strip's quantity display and `[-]`
 * action. Cards-kind lists key by `cardId` (one entry per card with quantity);
 * printing-kind lists key by `printingId`. Copy-kind lists have no add mode,
 * so the function returns an empty map there.
 * @returns Map keyed by cardId or printingId → entry.
 */
export function buildEntryByKey(
  kind: ListKind,
  entries: readonly ListEntryDetailResponse[],
): Map<string, ListEntryDetailResponse> {
  const result = new Map<string, ListEntryDetailResponse>();
  if (kind === "copy") {
    return result;
  }
  for (const entry of entries) {
    if (kind === "card" && entry.kind === "card") {
      result.set(entry.cardId, entry);
    } else if (kind === "printing" && entry.kind === "printing") {
      result.set(entry.printingId, entry);
    }
  }
  return result;
}
