import type { Printing } from "@openrift/shared";
import { XIcon } from "lucide-react";
import { Suspense, lazy, useRef } from "react";
import type { ReactNode } from "react";

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
import { Pressable } from "@/components/ui/pressable";
import { Skeleton } from "@/components/ui/skeleton";
import { useDomainColors } from "@/hooks/use-domain-colors";
import {
  closeOverlayHistoryEntry,
  hasOverlayHistoryEntry,
  useOverlayHistoryEntry,
} from "@/hooks/use-overlay-history-entry";
import { useSelectionDetail } from "@/hooks/use-selection-detail";
import { getDomainTintStyle } from "@/lib/domain";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

interface SelectionDetailModalProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
  /** Surface-specific add controls for the shown card. See SelectionDetailPane. */
  actions?: (printing: Printing) => ReactNode;
}

/**
 * The desktop card detail dialog, shown when the detail pane is not docked.
 * Wide enough for a two-column arrangement, so clicking a card never reflows
 * the grid underneath it.
 *
 * Arrow-key navigation is not handled here: `useGridKeyboardNav` already steps
 * the selection from a window listener, and the dialog follows the store, so a
 * second handler would double-step.
 * @returns The detail dialog, or null when the pane is docked.
 */
export function SelectionDetailModal({
  items,
  printingsByCardId,
  showImages,
  onSearchAndClose,
  actions,
}: SelectionDetailModalProps) {
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const paneDocked = useDisplayStore((s) => s.paneDocked);
  const setPaneDocked = useDisplayStore((s) => s.setPaneDocked);
  const domainColors = useDomainColors();

  const {
    selectedCard,
    detailOpen,
    siblingPrintings,
    handlePrevCard,
    handleNextCard,
    handleTagClick,
    handleKeywordClick,
    handleSelectPrinting,
    handleKeyDown,
    navLabel,
  } = useSelectionDetail({
    items,
    printingsByCardId,
    onSearchAndClose,
    onDismiss: closeDetail,
  });

  const open = detailOpen && !paneDocked && selectedCard !== null;

  // Docking hands the card to the pane, so the history entry has to be popped
  // without the pop being read as a dismissal.
  const dockingRef = useRef(false);

  // A history entry keeps the browser back button closing the dialog, matching
  // the mobile drawer.
  useOverlayHistoryEntry({
    active: open,
    stateKey: "cardDetail",
    onPop: () => {
      if (dockingRef.current) {
        dockingRef.current = false;
        return;
      }
      closeDetail();
    },
  });

  if (!open) {
    return null;
  }

  const handleClose = () => closeOverlayHistoryEntry("cardDetail", closeDetail);

  const handleDock = () => {
    if (hasOverlayHistoryEntry("cardDetail")) {
      dockingRef.current = true;
      history.back();
    }
    setPaneDocked(true);
  };

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
        style={getDomainTintStyle(selectedCard.card.domains, domainColors)}
        onKeyDown={handleKeyDown}
        // The stock close is named just "Close"; the pane and the mobile drawer
        // both say "Close card details", and one name across all three is what
        // lets a user (or a locator) find it the same way everywhere.
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
            actions={actions?.(selectedCard)}
            navLabel={navLabel}
            footerSlot={
              <span className="text-muted-foreground text-xs">
                Want this to stay open?{" "}
                <Pressable
                  onClick={handleDock}
                  className="text-foreground underline underline-offset-3"
                >
                  Dock it beside the grid
                </Pressable>
              </span>
            }
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Placeholder for the lazily-loaded modal detail. It has to mirror the modal's
 * own two-column arrangement: the pane's skeleton puts an `aspect-card` block at
 * full width, which in an 860px dialog is a ~1150px-tall placeholder, so the
 * dialog opened enormous and snapped down the moment the real layout mounted.
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
        {/* Same 340px column the real layout gives the art, so the placeholder
            occupies the height the card will. */}
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
