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

  // Prefer matching by printing id first: in cards+set the grid has multiple
  // tiles per cardId (one per set), so a cardId-only match would always
  // resolve to whichever tile sorts first and clicking the SFD reprint would
  // visually highlight the OGN tile. The cardId fallback covers cards-only
  // view where the user picked a variant via the chevron — the resulting
  // selection isn't in `deferredSortedCards`, so we light up the
  // representative tile for that card instead.
  const gridSelectedId = selectedCard
    ? (deferredSortedCards.find((c) => c.id === selectedCard.id)?.id ??
      (view === "cards"
        ? (deferredSortedCards.find((c) => c.cardId === selectedCard.cardId)?.id ?? selectedCard.id)
        : selectedCard.id))
    : undefined;

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
