import type { GroupByField, Printing } from "@openrift/shared";

import { CollectionTableActions } from "@/components/cards/collection-table-actions";
import { cardsViewTileKey, tileSiblings } from "@/lib/card-tiles";
import { isStackSelected } from "@/lib/stack-selection";
import type { StackedEntry } from "@/lib/stacked-entry";
import { useDragPreviewStore } from "@/stores/drag-preview-store";

import { DraggableCard } from "./draggable-card";

interface CollectionActionsCellProps {
  printing?: Printing;
  collectionId?: string;
  dataView: "cards" | "printings" | "copies";
  catalogPrintingsByCardId: Map<string, Printing[]>;
  tileGroupBy: GroupByField;
}

export function CollectionActionsCell({
  printing,
  collectionId,
  dataView,
  catalogPrintingsByCardId,
  tileGroupBy,
}: CollectionActionsCellProps) {
  if (!printing) {
    return null;
  }
  return (
    <CollectionTableActions
      printing={printing}
      collectionId={collectionId}
      siblingIds={
        dataView === "cards"
          ? tileSiblings(printing, catalogPrintingsByCardId.get(printing.cardId), tileGroupBy)?.map(
              (sibling) => sibling.id,
            )
          : undefined
      }
    />
  );
}

interface CollectionRowWrapperProps {
  printing?: Printing;
  itemId?: string;
  children?: React.ReactNode;
  collectionId: string | undefined;
  stackByItemId: Map<string, StackedEntry>;
  allCopyIdsByTile: Map<string, string[]>;
  sourceCollectionIsGroup: boolean;
  tileGroupBy: GroupByField;
  mode: "browse" | "select";
  stacked: boolean;
  selected: Set<string>;
}

export function CollectionRowWrapper({
  printing,
  itemId,
  children,
  collectionId,
  stackByItemId,
  allCopyIdsByTile,
  sourceCollectionIsGroup,
  tileGroupBy,
  mode,
  stacked,
  selected,
}: CollectionRowWrapperProps) {
  // Drag preview is shared from the parent's selection-driven store so all
  // rows agree on the same fanned set of cards during a select-mode drag.
  const dragPreviewPrintings = useDragPreviewStore((s) => s.preview);
  if (!printing || !itemId) {
    return children;
  }
  const stack = stackByItemId.get(itemId);
  if (!stack) {
    return children;
  }
  const cardCopyIds = allCopyIdsByTile.get(cardsViewTileKey(printing, tileGroupBy));
  const effectiveCopyIds = cardCopyIds ?? stack.copyIds;
  const isItemSelected =
    mode === "select" && isStackSelected(stacked, itemId, effectiveCopyIds, selected);
  const isFromSelection = mode === "select" && isItemSelected && selected.size > 0;
  const copyIds = isFromSelection ? [...selected] : stacked ? effectiveCopyIds : [itemId];
  const isStackDrag = !isFromSelection && stacked && effectiveCopyIds.length > 1;
  const previewPrintings = dragPreviewPrintings.length > 0 ? dragPreviewPrintings : [printing];
  // True only for a whole (non-selection) drag of group-owned copies.
  // Select-mode drags resolve their own copy set live at drop time.
  const sourceAllGroupCopies = !isFromSelection && copyIds.length > 0 && sourceCollectionIsGroup;
  return (
    <DraggableCard
      id={itemId}
      copyIds={copyIds}
      fromSelection={isFromSelection}
      isStackDrag={isStackDrag}
      printing={printing}
      previewPrintings={previewPrintings}
      sourceCollectionId={collectionId}
      sourceAllGroupCopies={sourceAllGroupCopies}
    >
      {children}
    </DraggableCard>
  );
}
