import type { Printing } from "@openrift/shared/types/catalog";

import type { StackedEntry } from "@/features/collections/lib/stacked-entry";
import type { CardViewerItem } from "@/lib/card-viewer-types";

export interface CollectionGridItems {
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
}

/**
 * Positional: an object literal argument makes the React Compiler treat the
 * grid's derived values as maybe-mutated and drop their memoization.
 */
export function buildCollectionGridItems(
  renderedCards: Printing[],
  stackByPrintingId: Map<string, StackedEntry>,
  collectionIdByCopyId: ReadonlyMap<string, string>,
  showLibrary: boolean,
  stacked: boolean,
): CollectionGridItems {
  const stackByItemId = new Map<string, StackedEntry>();

  if (showLibrary) {
    const items = renderedCards.map((printing) => {
      const stack = stackByPrintingId.get(printing.id);
      if (stack) {
        stackByItemId.set(printing.id, stack);
      }
      return { id: printing.id, printing };
    });
    return { items, stackByItemId };
  }

  const owned = renderedCards
    .map((printing) => ({ printing, stack: stackByPrintingId.get(printing.id) }))
    .filter(
      (entry): entry is { printing: Printing; stack: StackedEntry } => entry.stack !== undefined,
    );

  if (stacked) {
    const items = owned.map((entry) => {
      stackByItemId.set(entry.stack.printingId, entry.stack);
      return { id: entry.stack.printingId, printing: entry.printing };
    });
    return { items, stackByItemId };
  }

  const items = owned.flatMap((entry) =>
    entry.stack.copyIds.map((copyId) => {
      stackByItemId.set(copyId, entry.stack);
      return {
        id: copyId,
        printing: entry.printing,
        collectionId: collectionIdByCopyId.get(copyId),
      };
    }),
  );
  return { items, stackByItemId };
}

export function copyIdsShareOneCard(copyIds: string[], stacks: StackedEntry[]): boolean {
  if (copyIds.length <= 1) {
    return true;
  }
  const cardIdByCopyId = new Map<string, string>();
  for (const stack of stacks) {
    for (const copyId of stack.copyIds) {
      cardIdByCopyId.set(copyId, stack.printing.cardId);
    }
  }
  const cardIds = new Set(copyIds.map((copyId) => cardIdByCopyId.get(copyId)));
  return cardIds.size === 1;
}
