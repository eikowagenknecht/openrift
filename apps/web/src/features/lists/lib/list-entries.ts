import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";

import type { CardViewerItem } from "@/lib/card-viewer-types";

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

export function kindToView(kind: ListKind): "cards" | "printings" | "copies" {
  if (kind === "card") {
    return "cards";
  }
  if (kind === "printing") {
    return "printings";
  }
  return "copies";
}

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
        // Rule-derived copy entries have no entry id, so fall back to the copyId.
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

export function buildItemsFromCatalog(sortedCards: Printing[]): {
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
} {
  const items: CardViewerItem[] = sortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));
  // Empty on purpose: add mode reads quantities via the kind-keyed entryByKey map instead.
  return { items, entryByItemId: new Map() };
}

export function selectableEntryIds(
  items: readonly CardViewerItem[],
  entryByItemId: ReadonlyMap<string, ListEntryDetailResponse>,
): string[] {
  return items.flatMap((item) => {
    const entry = entryByItemId.get(item.id);
    return entry && entry.id !== null ? [entry.id] : [];
  });
}

export function resolveCopyMoveTarget(
  entries: readonly ListEntryDetailResponse[],
  selected: ReadonlySet<string>,
  copyId: string,
): string[] {
  const entryIdByCopyId = new Map(
    entries.flatMap((entry) =>
      entry.kind === "copy" && entry.id !== null ? [[entry.copyId, entry.id] as const] : [],
    ),
  );
  const entryId = entryIdByCopyId.get(copyId);
  if (entryId === undefined || !selected.has(entryId)) {
    return [copyId];
  }
  const copyIdByEntryId = new Map(
    entries.flatMap((entry) =>
      entry.kind === "copy" && entry.id !== null ? [[entry.id, entry.copyId] as const] : [],
    ),
  );
  return [...selected].flatMap((id) => {
    const selectedCopyId = copyIdByEntryId.get(id);
    return selectedCopyId === undefined ? [] : [selectedCopyId];
  });
}

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
