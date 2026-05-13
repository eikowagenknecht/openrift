import type { Printing } from "@openrift/shared";
import { Suspense, lazy, useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
}

/**
 * Fullscreen mobile card-detail drawer driven by the selection store.
 * BaseUI Drawer provides the backdrop, scroll-lock, and swipe-to-close;
 * a history.pushState entry keeps the Android back-button closing the drawer.
 * Renders nothing on desktop or when no card is selected.
 * @returns The mobile detail drawer or null.
 */
export function SelectionMobileOverlay({
  items,
  printingsByCardId,
  showImages,
  onSearchAndClose,
}: SelectionMobileOverlayProps) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
  const detailOpen = useSelectionStore((s) => s.detailOpen);
  const setSelectedCard = useSelectionStore((s) => s.setSelectedCard);
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const navigateToIndex = useSelectionStore((s) => s.navigateToIndex);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!detailOpen || !isMobile) {
      return;
    }
    history.pushState({ cardDetail: true }, "");
    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen, isMobile, closeDetail]);

  if (!isMobile || !selectedCard) {
    return null;
  }

  const siblingPrintings = printingsByCardId.get(selectedCard.cardId) ?? [];

  const handleClose = () => {
    if (history.state?.cardDetail) {
      history.back();
    } else {
      closeDetail();
    }
  };

  const handlePrevCard =
    selectedIndex > 0
      ? () => navigateToIndex(selectedIndex - 1, items[selectedIndex - 1].printing)
      : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < items.length - 1
      ? () => navigateToIndex(selectedIndex + 1, items[selectedIndex + 1].printing)
      : undefined;

  const handleSelectPrinting = (printing: Printing) => {
    const idx = items.findIndex((item) => item.printing.id === printing.id);
    if (idx === -1) {
      setSelectedCard(printing);
    } else {
      navigateToIndex(idx, printing);
    }
  };

  return (
    <Drawer
      open={detailOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DrawerContent className="data-[swipe-direction=down]:mt-0 data-[swipe-direction=down]:h-full data-[swipe-direction=down]:max-h-screen data-[swipe-direction=down]:rounded-none data-[swipe-direction=down]:border-t-0">
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
              onTagClick={(tag) => onSearchAndClose(`t:${tag}`)}
              onKeywordClick={(keyword) => onSearchAndClose(`k:${keyword}`)}
              printings={siblingPrintings}
              onSelectPrinting={handleSelectPrinting}
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
