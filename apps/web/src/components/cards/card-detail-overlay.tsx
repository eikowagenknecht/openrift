import type { Printing } from "@openrift/shared/types/catalog";
import { XIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { OverlayHistoryKey } from "@/hooks/use-overlay-history-entry";
import {
  closeOverlayHistoryEntry,
  useOverlayHistoryEntry,
} from "@/hooks/use-overlay-history-entry";
import { useCardDetailNavigation } from "@/hooks/use-selection-detail";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { getDomainTintStyle } from "@/lib/domain";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

interface CardDetailOverlayProps {
  printingIds: string[];
  openPrintingId: string | null;
  onOpenPrintingIdChange: (printingId: string | null) => void;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
  historyKey: OverlayHistoryKey;
}

/**
 * A card detail overlay a surface drives itself, by printing id: the fullscreen
 * drawer on phones, the two-column dialog on desktop. Unlike a card-browser
 * surface, it does not touch the global selection store.
 */
export function CardDetailOverlay(props: CardDetailOverlayProps) {
  if (props.openPrintingId === null) {
    return null;
  }
  // The catalog read suspends; every host has it cached by the time it can show
  // a row, so the null fallback only ever covers a cold cache.
  return (
    <Suspense fallback={null}>
      <CardDetailOverlayContent {...props} />
    </Suspense>
  );
}

function CardDetailOverlayContent({
  printingIds,
  openPrintingId,
  onOpenPrintingIdChange,
  showImages,
  onSearchAndClose,
  historyKey,
}: CardDetailOverlayProps) {
  const { printingsById, printingsByCardId } = useCards();
  const isMobile = useIsMobile();
  const domainColors = useDomainColors();

  // Keyed by forPrintingId so moving to another row drops the pick without an effect.
  const [picked, setPicked] = useState<{ forPrintingId: string; printing: Printing } | null>(null);

  const items: CardViewerItem[] = printingIds.flatMap((id) => {
    const printing = printingsById[id];
    return printing ? [{ id, printing }] : [];
  });

  const selectedIndex = items.findIndex((item) => item.id === openPrintingId);
  const pickedPrinting = picked?.forPrintingId === openPrintingId ? picked.printing : undefined;
  const rowPrinting = openPrintingId === null ? undefined : printingsById[openPrintingId];
  const selectedCard = pickedPrinting ?? rowPrinting ?? null;

  const handleClose = () => {
    closeOverlayHistoryEntry(historyKey, () => {
      setPicked(null);
      onOpenPrintingIdChange(null);
    });
  };

  const {
    siblingPrintings,
    handlePrevCard,
    handleNextCard,
    handleTagClick,
    handleKeywordClick,
    handleSelectPrinting,
    handleKeyDown,
    navLabel,
  } = useCardDetailNavigation({
    items,
    printingsByCardId,
    onSearchAndClose,
    onDismiss: handleClose,
    selectedCard,
    selectedIndex,
    setSelectedCard: (printing) => {
      if (openPrintingId !== null) {
        setPicked({ forPrintingId: openPrintingId, printing });
      }
    },
    navigateToIndex: (_index, printing) => {
      setPicked(null);
      onOpenPrintingIdChange(printing.id);
    },
  });

  useOverlayHistoryEntry({
    active: true,
    stateKey: historyKey,
    onPop: () => onOpenPrintingIdChange(null),
  });

  if (selectedCard === null) {
    return null;
  }

  const tint = getDomainTintStyle(selectedCard.card.domains, domainColors);

  if (isMobile) {
    return (
      <Drawer
        open
        onOpenChange={(next) => {
          if (!next) {
            handleClose();
          }
        }}
      >
        <DrawerContent
          className="data-[swipe-direction=down]:h-[calc(100dvh-env(safe-area-inset-top,0px))] data-[swipe-direction=down]:max-h-none"
          style={tint}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>Card details</DrawerTitle>
            <DrawerDescription>Details for the selected card</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Suspense fallback={<CardDetailPaneSkeleton />}>
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
              />
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          handleClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[860px]"
        style={tint}
        onKeyDown={handleKeyDown}
        // aria-label matches the pane and the drawer so one label finds the close control everywhere.
        showCloseButton={false}
      >
        <DialogClose
          render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
          aria-label="Close card details"
        >
          <XIcon className="size-4" />
        </DialogClose>
        <DialogHeader className="sr-only">
          <DialogTitle>Card details</DialogTitle>
          <DialogDescription>Details for the selected card</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<CardDetailModalSkeleton />}>
          <CardDetail
            printing={selectedCard}
            layout="modal"
            showImages={showImages}
            onPrevCard={handlePrevCard}
            onNextCard={handleNextCard}
            onTagClick={handleTagClick}
            onKeywordClick={handleKeywordClick}
            printings={siblingPrintings}
            onSelectPrinting={handleSelectPrinting}
            navLabel={navLabel}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mirrors the two-column arrangement: a full-width `aspect-card` block inside
 * an 860px dialog would open the dialog ~1150px tall and then snap it down.
 */
function CardDetailModalSkeleton() {
  return (
    <div className="@container flex flex-col gap-4">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid gap-5 @2xl:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="aspect-card w-full rounded-xl" />
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function CardDetailPaneSkeleton() {
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
