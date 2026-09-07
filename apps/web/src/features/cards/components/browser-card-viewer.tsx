import type { Printing } from "@openrift/shared/types/catalog";
import type { GroupByField } from "@openrift/shared/types/search";
import type { ReactNode } from "react";
import { useEffect } from "react";

import type { CardTableProps } from "@/features/cards/components/card-viewer";
import { CardViewer } from "@/features/cards/components/card-viewer";
import { useGridFocusStore } from "@/features/cards/stores/grid-focus-store";
import type { GroupInfo } from "@/lib/card-group-types";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

const EMPTY_SIBLINGS: Printing[] = [];

interface BrowserCardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  renderedCards: Printing[];
  printingsByCardId: Map<string, Printing[]>;
  view: "cards" | "printings";
  stale?: boolean;
  toolbar?: ReactNode;
  leftPane?: ReactNode;
  aboveGrid?: ReactNode;
  banner?: ReactNode;
  rightPane?: ReactNode;
  addStripHeight?: number;
  table?: CardTableProps;
  noResultsDescription?: ReactNode;
  children?: ReactNode;
}

/** Thin wrapper around CardViewer that bridges the selection store to grid props. */
export function BrowserCardViewer({
  items,
  renderedCards,
  printingsByCardId,
  view,
  ...rest
}: BrowserCardViewerProps) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);

  // Without this, the highlight follows the index onto the next card after a
  // reshape (a moved copy, a filter) while the detail pane still shows the one that left.
  useEffect(() => {
    useSelectionStore.getState().reconcileSelection(items);
  }, [items]);

  // Stays stable when the detail panel swaps to a sibling printing via setSelectedCard.
  const indexAnchor =
    selectedIndex >= 0 && selectedIndex < items.length ? items[selectedIndex] : undefined;

  // Falls back to cardId in cards-only view, where chevron-picked variants aren't in the grid items.
  const gridSelectedId =
    indexAnchor?.id ??
    (selectedCard
      ? (renderedCards.find((c) => c.id === selectedCard.id)?.id ??
        (view === "cards"
          ? (renderedCards.find((c) => c.cardId === selectedCard.cardId)?.id ?? selectedCard.id)
          : selectedCard.id))
      : undefined);

  useEffect(() => {
    useGridFocusStore.getState().setSelectedItemId(gridSelectedId ?? null);
  }, [gridSelectedId]);

  const siblingPrintings = selectedCard
    ? (printingsByCardId.get(selectedCard.cardId) ?? EMPTY_SIBLINGS)
    : EMPTY_SIBLINGS;

  return (
    <CardViewer
      {...rest}
      items={items}
      selectedItemId={gridSelectedId}
      siblingPrintings={siblingPrintings}
    />
  );
}
