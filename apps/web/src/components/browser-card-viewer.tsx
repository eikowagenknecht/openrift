import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import { useSelectionStore } from "@/stores/selection-store";

const EMPTY_SIBLINGS: Printing[] = [];

interface BrowserCardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  deferredSortedCards: Printing[];
  printingsByCardId: Map<string, Printing[]>;
  view: "cards" | "printings";
  onItemClick: (printing: Printing) => void;
  stale?: boolean;
  toolbar?: ReactNode;
  leftPane?: ReactNode;
  aboveGrid?: ReactNode;
  rightPane?: ReactNode;
  addStripHeight?: number;
  children?: ReactNode;
}

/**
 * Thin wrapper around CardViewer that bridges the selection store to grid props.
 * Subscribes to `selectedCard` to compute `gridSelectedId` and `siblingPrintings`.
 * @returns The card viewer with selection-aware props.
 */
export function BrowserCardViewer({
  items,
  deferredSortedCards,
  printingsByCardId,
  view,
  onItemClick,
  ...rest
}: BrowserCardViewerProps) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);

  // The grid cell the user is anchored at — the one they originally clicked.
  // Stays stable when the detail panel swaps to a sibling printing via
  // setSelectedCard (which doesn't update selectedIndex), so both the
  // visual highlight and arrow-key navigation keep working from that cell.
  // Guard the index against stale items (filter changes can shrink the list).
  const indexAnchor =
    selectedIndex >= 0 && selectedIndex < items.length ? items[selectedIndex] : undefined;

  // Prefer the index anchor, then exact printing.id match, then a cardId
  // fallback for cards-only view where chevron-picked variants aren't in the
  // grid items — light up the representative tile for that card instead.
  const gridSelectedId =
    indexAnchor?.id ??
    (selectedCard
      ? (deferredSortedCards.find((c) => c.id === selectedCard.id)?.id ??
        (view === "cards"
          ? (deferredSortedCards.find((c) => c.cardId === selectedCard.cardId)?.id ??
            selectedCard.id)
          : selectedCard.id))
      : undefined);

  const siblingPrintings = selectedCard
    ? (printingsByCardId.get(selectedCard.cardId) ?? EMPTY_SIBLINGS)
    : EMPTY_SIBLINGS;

  return (
    <CardViewer
      {...rest}
      items={items}
      selectedItemId={gridSelectedId}
      keyboardNavItemId={indexAnchor?.id ?? selectedCard?.id}
      keyboardNavCardId={selectedCard?.cardId}
      onItemClick={onItemClick}
      siblingPrintings={siblingPrintings}
    />
  );
}
