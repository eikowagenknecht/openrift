import type { Printing } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useApplyTagFilter } from "@/hooks/use-apply-tag-filter";
import { useSelectionStore } from "@/stores/selection-store";

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
 * The wiring every card-detail surface needs: the selected printing, its
 * siblings, bounds-checked prev/next handlers, tag and printing callbacks, and
 * the position label. Kept in one place so the docked pane, the desktop modal
 * and the mobile drawer can never disagree about what a click does.
 * @returns The shared detail props for the current selection.
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
  const applyTagFilter = useApplyTagFilter();

  const siblingPrintings =
    selectedCard === null ? [] : (printingsByCardId.get(selectedCard.cardId) ?? []);

  // The store's selectedIndex can go stale against `items` (the list shrinks
  // or reorders while the detail is open), so both neighbors are bounds-checked
  // against the current array, not just the index (OPENRIFT-SSR-22).
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

  const navLabel =
    selectedIndex >= 0 && items.length > 0 ? `${selectedIndex + 1} / ${items.length}` : undefined;

  return {
    selectedCard,
    detailOpen,
    siblingPrintings,
    handlePrevCard,
    handleNextCard,
    handleTagClick,
    handleKeywordClick,
    handleSelectPrinting,
    navLabel,
  };
}
