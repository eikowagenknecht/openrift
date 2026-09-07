import type { Printing } from "@openrift/shared";
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { Pane } from "@/components/layout/panes";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelectionDetail } from "@/hooks/use-selection-detail";
import { useDisplayStore } from "@/stores/display-store";
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
  actions?: (printing: Printing) => ReactNode;
}

/** Stays mounted with an empty state when no card is selected; never unmounts. */
export function SelectionDetailPane({
  items,
  printingsByCardId,
  showImages,
  onSearchAndClose,
  actions,
}: SelectionDetailPaneProps) {
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const paneDocked = useDisplayStore((s) => s.paneDocked);
  const setPaneDocked = useDisplayStore((s) => s.setPaneDocked);

  // Closes the panel, not just the card: undocking alone would hand the
  // still-selected card to the modal.
  const handleClose = () => {
    setPaneDocked(false);
    closeDetail();
  };

  const {
    selectedCard,
    siblingPrintings,
    handlePrevCard,
    handleNextCard,
    handleTagClick,
    handleKeywordClick,
    handleSelectPrinting,
  } = useSelectionDetail({
    items,
    printingsByCardId,
    onSearchAndClose,
    onDismiss: closeDetail,
  });

  if (!paneDocked) {
    return null;
  }

  return (
    <Pane className="@md:block">
      {selectedCard ? (
        <Suspense fallback={<CardDetailSkeleton />}>
          <CardDetail
            printing={selectedCard}
            onClose={handleClose}
            showImages={showImages}
            onPrevCard={handlePrevCard}
            onNextCard={handleNextCard}
            onTagClick={handleTagClick}
            onKeywordClick={handleKeywordClick}
            printings={siblingPrintings}
            onSelectPrinting={handleSelectPrinting}
            actions={actions?.(selectedCard)}
          />
        </Suspense>
      ) : (
        <PaneEmptyState />
      )}
    </Pane>
  );
}

function PaneEmptyState() {
  return (
    <div className="text-muted-foreground flex h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm">
      Select a card to see its details
    </div>
  );
}

export function CardDetailSkeleton() {
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
