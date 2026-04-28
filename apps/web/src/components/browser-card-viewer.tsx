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

  const gridSelectedId =
    view === "cards" && selectedCard
      ? (deferredSortedCards.find((c) => c.cardId === selectedCard.cardId)?.id ?? selectedCard.id)
      : selectedCard?.id;

  const siblingPrintings = selectedCard
    ? (printingsByCardId.get(selectedCard.cardId) ?? EMPTY_SIBLINGS)
    : EMPTY_SIBLINGS;

  return (
    <CardViewer
      {...rest}
      items={items}
      selectedItemId={gridSelectedId}
      keyboardNavItemId={selectedCard?.id}
      onItemClick={onItemClick}
      siblingPrintings={siblingPrintings}
    />
  );
}
