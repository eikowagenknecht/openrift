import type { Printing } from "@openrift/shared";
import { Suspense, lazy, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { CardDetailSkeleton } from "@/components/selection-detail-pane";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pressable } from "@/components/ui/pressable";
import { useDomainColors } from "@/hooks/use-domain-colors";
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
  useEffect(() => {
    if (!open) {
      return;
    }
    history.pushState({ cardDetail: true }, "");
    const handlePop = () => {
      if (dockingRef.current) {
        dockingRef.current = false;
        return;
      }
      closeDetail();
    };
    globalThis.addEventListener("popstate", handlePop);
    return () => globalThis.removeEventListener("popstate", handlePop);
  }, [open, closeDetail]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (history.state?.cardDetail) {
      history.back();
    } else {
      closeDetail();
    }
  };

  const handleDock = () => {
    if (history.state?.cardDetail) {
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
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Card details</DialogTitle>
          <DialogDescription>Details for the selected card</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<CardDetailSkeleton />}>
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
          />
        </Suspense>
        <p className="text-muted-foreground border-t pt-3 text-center text-xs">
          Want this to stay open?{" "}
          <Pressable onClick={handleDock} className="text-foreground underline underline-offset-3">
            Dock it beside the grid
          </Pressable>
        </p>
      </DialogContent>
    </Dialog>
  );
}
