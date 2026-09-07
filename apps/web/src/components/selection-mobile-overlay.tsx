import type { Printing } from "@openrift/shared";
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  closeOverlayHistoryEntry,
  useOverlayHistoryEntry,
} from "@/hooks/use-overlay-history-entry";
import { useSelectionDetail } from "@/hooks/use-selection-detail";
import { getDomainTintStyle } from "@/lib/domain";
import { useSelectionStore } from "@/stores/selection-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

interface SelectionMobileOverlayProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
  actions?: (printing: Printing) => ReactNode;
}

export function SelectionMobileOverlay({
  items,
  printingsByCardId,
  showImages,
  onSearchAndClose,
  actions,
}: SelectionMobileOverlayProps) {
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const isMobile = useIsMobile();
  const domainColors = useDomainColors();

  const handleClose = () => closeOverlayHistoryEntry("cardDetail", closeDetail);

  const {
    selectedCard,
    detailOpen,
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
    onDismiss: handleClose,
  });

  useOverlayHistoryEntry({
    active: detailOpen && isMobile,
    stateKey: "cardDetail",
    onPop: closeDetail,
  });

  if (!isMobile || !selectedCard) {
    return null;
  }

  return (
    <Drawer
      open={detailOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DrawerContent
        // Fixed height overrides the popup's auto sizing to fill the screen
        // minus the iOS safe area.
        className="data-[swipe-direction=down]:h-[calc(100dvh-env(safe-area-inset-top,0px))] data-[swipe-direction=down]:max-h-none"
        style={getDomainTintStyle(selectedCard.card.domains, domainColors)}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>Card details</DrawerTitle>
          <DrawerDescription>Details for the selected card</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CardDetailSkeleton() {
  return (
    <div className="bg-background rounded-lg px-3">
      <div className="border-border/30 border-b p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
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
