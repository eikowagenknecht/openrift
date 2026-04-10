import type { Printing } from "@openrift/shared";
import { Suspense, lazy, useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { MobileDetailOverlay } from "@/components/layout/mobile-detail-overlay";
import { Skeleton } from "@/components/ui/skeleton";
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
 * Mobile fullscreen detail overlay that subscribes to the selection store.
 * Owns body scroll lock and browser history management for mobile back-button.
 * Renders nothing when no card is selected, detail is closed, or not on mobile.
 * @returns The mobile overlay or null.
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

  // Lock body scroll when the mobile overlay is active
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen]);

  // Push a history entry so the browser back button closes the overlay
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    history.pushState({ cardDetail: true }, "");
    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen, closeDetail]);

  if (!selectedCard || !detailOpen) {
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

  return (
    <MobileDetailOverlay>
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
          onSelectPrinting={setSelectedCard}
        />
      </Suspense>
    </MobileDetailOverlay>
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
