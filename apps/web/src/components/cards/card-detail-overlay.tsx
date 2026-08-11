import type { Printing } from "@openrift/shared";
import { XIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
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
import { getDomainTintStyle } from "@/lib/domain";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

interface CardDetailOverlayProps {
  /**
   * Printing ids of the host's rows, in the order they are listed. This is the
   * prev/next sequence, so the overlay steps through those rows rather than the
   * whole catalog. Pass an empty array for a surface that opens one card at a
   * time — prev/next and the position label then stay out of the detail.
   */
  printingIds: string[];
  /** Which row's detail is open, or null when closed. */
  openPrintingId: string | null;
  onOpenPrintingIdChange: (printingId: string | null) => void;
  showImages: boolean;
  /** Runs a catalog search for a clicked tag or keyword, closing the overlay. */
  onSearchAndClose: (query: string) => void;
  /**
   * Which history flag this overlay owns. A host that stacks it on another
   * overlay needs a key of its own, so neither reads the other's entry as one
   * of theirs.
   */
  historyKey: OverlayHistoryKey;
}

/**
 * A card detail overlay a surface drives itself, by printing id: the fullscreen
 * drawer on phones, the two-column dialog on desktop.
 *
 * Unlike every card-browser surface this does not touch the global selection
 * store, which makes it the one to reach for where that store is unavailable or
 * already spoken for: a page that mounts no `SelectionDetailOverlays` at all
 * (the trades surfaces, which have no grid and so no docked pane to fall back
 * to when a card click finds the modal standing down), or a dialog stacked on a
 * page that does mount one, where a second reader of that store would put two
 * copies of the detail on screen at once (the deck's missing-cards dialog).
 * @returns The detail overlay for this viewport, or null while closed.
 */
export function CardDetailOverlay(props: CardDetailOverlayProps) {
  if (props.openPrintingId === null) {
    return null;
  }
  // The catalog read suspends. Every host has it cached by the time it can show
  // a card row at all, so this resolves in the same commit; the null fallback
  // only ever covers a cold cache.
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

  // A printing chosen in the overlay's own picker is remembered against the row
  // it was chosen from, so moving to another row drops it without needing an
  // effect to reset the state.
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

  // A history entry keeps the browser (and Android) back button closing the
  // detail and returning to whatever it was opened from, rather than leaving
  // the page with everything still open.
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
        // Named to match the pane and the drawer, so one label finds the close
        // control on every surface.
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
 * Modal-shaped placeholder for the lazily-loaded detail. It has to mirror the
 * two-column arrangement: a full-width `aspect-card` block inside an 860px
 * dialog is a ~1150px-tall placeholder, which opens the dialog enormous and
 * then snaps it down.
 * @returns The modal-shaped loading skeleton.
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

/**
 * Single-column placeholder for the drawer, matching the pane arrangement.
 * @returns The pane-shaped loading skeleton.
 */
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
