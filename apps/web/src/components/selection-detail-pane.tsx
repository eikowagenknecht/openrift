import type { Printing } from "@openrift/shared";
import { Suspense, lazy } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { Pane } from "@/components/layout/panes";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelectionStore } from "@/stores/selection-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

interface SelectionDetailPaneProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
}

/**
 * Desktop detail pane that subscribes to the selection store.
 * Renders nothing when no card is selected or detail is closed.
 * @returns The detail pane or null.
 */
export function SelectionDetailPane({
  items,
  printingsByCardId,
  showImages,
  onSearchAndClose,
}: SelectionDetailPaneProps) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
  const detailOpen = useSelectionStore((s) => s.detailOpen);
  const setSelectedCard = useSelectionStore((s) => s.setSelectedCard);
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const navigateToIndex = useSelectionStore((s) => s.navigateToIndex);

  if (!selectedCard || !detailOpen) {
    return null;
  }

  const siblingPrintings = printingsByCardId.get(selectedCard.cardId) ?? [];

  const handlePrevCard =
    selectedIndex > 0
      ? () => navigateToIndex(selectedIndex - 1, items[selectedIndex - 1].printing)
      : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < items.length - 1
      ? () => navigateToIndex(selectedIndex + 1, items[selectedIndex + 1].printing)
      : undefined;

  // When a picked printing is also a grid tile (e.g. cards+set with multiple
  // tiles per card), bump selectedIndex onto it so arrow-key navigation and
  // grid highlighting both follow the picker. Otherwise leave the index alone
  // so they keep tracking the original grid cell.
  const handleSelectPrinting = (printing: Printing) => {
    const idx = items.findIndex((item) => item.printing.id === printing.id);
    if (idx === -1) {
      setSelectedCard(printing);
    } else {
      navigateToIndex(idx, printing);
    }
  };

  return (
    <Pane className="@md:block">
      <Suspense fallback={<CardDetailSkeleton />}>
        <CardDetail
          printing={selectedCard}
          onClose={closeDetail}
          showImages={showImages}
          onPrevCard={handlePrevCard}
          onNextCard={handleNextCard}
          onTagClick={(tag) => onSearchAndClose(`t:${tag}`)}
          onKeywordClick={(keyword) => onSearchAndClose(`k:${keyword}`)}
          printings={siblingPrintings}
          onSelectPrinting={handleSelectPrinting}
        />
      </Suspense>
    </Pane>
  );
}

function CardDetailSkeleton() {
  return (
    <div className="bg-background rounded-lg px-3">
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        <Skeleton className="aspect-card w-full rounded-xl" />
        <div className="flex justify-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}
