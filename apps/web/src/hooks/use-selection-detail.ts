import type { Printing } from "@openrift/shared";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useApplyTagFilter } from "@/hooks/use-apply-tag-filter";
import { useSelectionStore } from "@/stores/selection-store";

interface UseCardDetailNavigationParams {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  onSearchAndClose: (query: string) => void;
  /**
   * How this surface dismisses itself. The pane and the modal close the store;
   * the mobile drawer pops its own history entry first.
   */
  onDismiss: () => void;
  /** The printing currently shown, or null when nothing is selected. */
  selectedCard: Printing | null;
  /** Its position in `items`, or -1 when the selection is not a list item. */
  selectedIndex: number;
  /** Switch printing without moving the index (the printing picker). */
  setSelectedCard: (printing: Printing) => void;
  /** Move to a known list position (prev/next, arrow keys). */
  navigateToIndex: (index: number, printing: Printing) => void;
}

/**
 * The card-detail wiring itself, over a selection the caller supplies: sibling
 * printings, bounds-checked prev/next handlers, tag and printing callbacks,
 * arrow-key navigation, and the position label.
 *
 * Most surfaces want {@link useSelectionDetail}, which supplies the global
 * selection store. This variant exists for a detail overlay that must not
 * disturb the page's own selection — the missing-cards dialog opens one on top
 * of itself, while the page underneath already has a store-driven overlay
 * mounted, and two overlays reading one store would both go live.
 * @returns The shared detail props for the given selection.
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

  // The store's selectedIndex can go stale against `items` (the list shrinks
  // or reorders while the detail is open), so both neighbors are bounds-checked
  // against the current array, not just the index.
  const prevItem = selectedIndex > 0 ? items[selectedIndex - 1] : undefined;
  const handlePrevCard = prevItem
    ? () => navigateToIndex(selectedIndex - 1, prevItem.printing)
    : undefined;

  const nextItem = selectedIndex >= 0 ? items[selectedIndex + 1] : undefined;
  const handleNextCard = nextItem
    ? () => navigateToIndex(selectedIndex + 1, nextItem.printing)
    : undefined;

  // Tags apply the structured filter (exact match) where the surface has one;
  // the quoted `t:"…"` search fallback keeps multi-word tags a single term.
  const handleTagClick = (tag: string) => {
    if (applyTagFilter) {
      applyTagFilter(tag);
      onDismiss();
    } else {
      onSearchAndClose(`t:"${tag}"`);
    }
  };

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

  const handleKeywordClick = (keyword: string) => onSearchAndClose(`k:${keyword}`);

  /**
   * Arrow-key navigation for an overlay that holds focus, mirroring the grid's
   * own handler: left/right step through the list, up/down cycle the card's
   * sibling printings. `useGridKeyboardNav` listens on the window and does not
   * reach inside a focus-trapped dialog, so the overlay has to carry this
   * itself; stopping propagation keeps the two from double-stepping wherever
   * the event would have escaped.
   */
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
  /**
   * How this surface dismisses itself. The pane and the modal close the store;
   * the mobile drawer pops its own history entry first.
   */
  onDismiss: () => void;
}

/**
 * {@link useCardDetailNavigation} over the global selection store — what the
 * docked pane, the desktop modal and the mobile drawer all use, so they can
 * never disagree about what a card click does.
 * @returns The shared detail props for the current selection, plus its open state.
 */
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
