import type { Printing } from "@openrift/shared";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { useApplyTagFilter } from "@/hooks/use-apply-tag-filter";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

interface UseCardDetailNavigationParams {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  onSearchAndClose: (query: string) => void;
  onDismiss: () => void;
  selectedCard: Printing | null;
  selectedIndex: number;
  setSelectedCard: (printing: Printing) => void;
  navigateToIndex: (index: number, printing: Printing) => void;
}

/**
 * Most surfaces want {@link useSelectionDetail}. This variant is for an overlay
 * that must not disturb the page's own selection store (the missing-cards dialog).
 */
export function useCardDetailNavigation({
  items,
  printingsByCardId,
  onSearchAndClose,
  onDismiss,
  selectedCard,
  selectedIndex,
  setSelectedCard,
  navigateToIndex,
}: UseCardDetailNavigationParams) {
  const applyTagFilter = useApplyTagFilter();

  const siblingPrintings =
    selectedCard === null ? [] : (printingsByCardId.get(selectedCard.cardId) ?? []);

  // selectedIndex can go stale against `items` (list shrinks/reorders while open),
  // so neighbors are bounds-checked against the current array, not just the index.
  const prevItem = selectedIndex > 0 ? items[selectedIndex - 1] : undefined;
  const handlePrevCard = prevItem
    ? () => navigateToIndex(selectedIndex - 1, prevItem.printing)
    : undefined;

  const nextItem = selectedIndex >= 0 ? items[selectedIndex + 1] : undefined;
  const handleNextCard = nextItem
    ? () => navigateToIndex(selectedIndex + 1, nextItem.printing)
    : undefined;

  const handleTagClick = (tag: string) => {
    if (applyTagFilter) {
      applyTagFilter(tag);
      onDismiss();
    } else {
      onSearchAndClose(`t:"${tag}"`);
    }
  };

  // Bumps selectedIndex onto the picked printing when it is also a grid tile,
  // so arrow-key nav and grid highlighting follow it; otherwise leaves the index alone.
  const handleSelectPrinting = (printing: Printing) => {
    const idx = items.findIndex((item) => item.printing.id === printing.id);
    if (idx === -1) {
      setSelectedCard(printing);
    } else {
      navigateToIndex(idx, printing);
    }
  };

  const handleKeywordClick = (keyword: string) => onSearchAndClose(`k:${keyword}`);

  // useGridKeyboardNav listens on the window and can't reach inside a focus-trapped
  // dialog, so this overlay carries its own left/right/up/down handling.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName.toLowerCase() ?? "";
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return;
    }
    // The language tabs own left/right for their own roving focus.
    if (target?.closest('[role="tablist"]')) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const step = event.key === "ArrowLeft" ? handlePrevCard : handleNextCard;
      if (!step) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      step();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (siblingPrintings.length < 2 || selectedCard === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const idx = siblingPrintings.findIndex((p) => p.id === selectedCard.id);
      const next =
        event.key === "ArrowUp"
          ? idx > 0
            ? idx - 1
            : siblingPrintings.length - 1
          : idx < siblingPrintings.length - 1
            ? idx + 1
            : 0;
      handleSelectPrinting(siblingPrintings[next]);
    }
  };

  const navLabel =
    selectedIndex >= 0 && items.length > 0 ? `${selectedIndex + 1} / ${items.length}` : undefined;

  return {
    selectedCard,
    siblingPrintings,
    handlePrevCard,
    handleNextCard,
    handleTagClick,
    handleKeywordClick,
    handleSelectPrinting,
    handleKeyDown,
    navLabel,
  };
}

interface UseSelectionDetailParams {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  onSearchAndClose: (query: string) => void;
  onDismiss: () => void;
}

export function useSelectionDetail({
  items,
  printingsByCardId,
  onSearchAndClose,
  onDismiss,
}: UseSelectionDetailParams) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
  const detailOpen = useSelectionStore((s) => s.detailOpen);
  const setSelectedCard = useSelectionStore((s) => s.setSelectedCard);
  const navigateToIndex = useSelectionStore((s) => s.navigateToIndex);

  const detail = useCardDetailNavigation({
    items,
    printingsByCardId,
    onSearchAndClose,
    onDismiss,
    selectedCard,
    selectedIndex,
    setSelectedCard,
    navigateToIndex,
  });

  return { ...detail, detailOpen };
}
