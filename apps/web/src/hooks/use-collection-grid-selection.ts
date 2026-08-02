import type { GroupByField, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import {
  computeDragSelectionSummary,
  dragSelectionNoun,
} from "@/components/collection/collection-drag";
import type { CopyDetailsTarget } from "@/components/collection/copy-details-dialog";
import { buildOnDecrement } from "@/components/collection/route-decrement";
import type { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { cardsViewTileKey, splitsCardIntoTiles } from "@/lib/card-tiles";
import { computeShiftRange, resolveContextActionTarget } from "@/lib/stack-selection";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";
import type { CollectionContextAction } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDragPreviewStore } from "@/stores/drag-preview-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

function printingsArrayEqual(a: readonly Printing[], b: readonly Printing[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let idx = 0; idx < a.length; idx++) {
    if (a[idx] !== b[idx]) {
      return false;
    }
  }
  return true;
}

interface UseCollectionGridSelectionParams {
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
  stackByPrintingId: Map<string, StackedEntry>;
  stacks: StackedEntry[];
  tileGroupBy: GroupByField;
  dataView: "cards" | "printings";
  view: "cards" | "printings" | "copies";
  stacked: boolean;
  mode: "browse" | "select";
  setSelectMode: (value: boolean) => void;
  // ── Selection state, owned by the caller's useCardSelection() call — passed
  //    through rather than called again here so `clearSelection` etc. keep the
  //    single reference the rest of CollectionGrid (and its effect deps) use.
  selected: Set<string>;
  toggleSelect: (itemId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  clearSelection: () => void;
  getLastSelectedItemId: () => string | null;
  setLastSelectedItemId: (itemId: string) => void;
  addToSelection: (ids: string[]) => void;
  handleQuickAdd: ReturnType<typeof useQuickAddActions>["handleQuickAdd"];
  tryUndoAdd: ReturnType<typeof useQuickAddActions>["tryUndoAdd"];
  handleOpenVariants: ReturnType<typeof useQuickAddActions>["handleOpenVariants"];
  handleTake: (itemId: string, count: number) => void;
  setLendTarget: (target: { printing: Printing; maxQuantity: number } | null) => void;
  setCopyDetailsTarget: (target: CopyDetailsTarget | null) => void;
  openAction: (action: CollectionContextAction, copyIds: string[]) => void;
}

/**
 * Bundles the collection grid's click handlers (row click, sibling click,
 * stack toggle, shift-range, right-click context action), the drag-preview
 * summary effect, and the row-actions-store registration effect that lets the
 * virtualized grid's cells dispatch these handlers without taking unstable
 * closures as props. Selection state itself (`selected`, `clearSelection`,
 * etc.) is owned by the caller so its references stay stable for the rest of
 * CollectionGrid; this hook only consumes them.
 * @returns The tile→copy-id map the row wiring needs (`allCopyIdsByTile`).
 */
export function useCollectionGridSelection({
  items,
  stackByItemId,
  stackByPrintingId,
  stacks,
  tileGroupBy,
  dataView,
  view,
  stacked,
  mode,
  setSelectMode,
  selected,
  toggleSelect,
  toggleStack,
  clearSelection,
  getLastSelectedItemId,
  setLastSelectedItemId,
  addToSelection,
  handleQuickAdd,
  tryUndoAdd,
  handleOpenVariants,
  handleTake,
  setLendTarget,
  setCopyDetailsTarget,
  openAction,
}: UseCollectionGridSelectionParams) {
  // In "cards" view, collect all copy IDs and printing IDs per tile for
  // selection/popover. Keyed by the tile (cardId, or cardId|set / cardId|rarity
  // when split) so a card owned across sets keeps each set tile's copies
  // separate instead of pooling them under one card.
  const allCopyIdsByTile = new Map<string, string[]>();
  const allPrintingIdsByTile = new Map<string, string[]>();
  if (dataView === "cards") {
    for (const stack of stacks) {
      const tileKey = cardsViewTileKey(stack.printing, tileGroupBy);
      const copyIds = allCopyIdsByTile.get(tileKey);
      if (copyIds) {
        copyIds.push(...stack.copyIds);
      } else {
        allCopyIdsByTile.set(tileKey, [...stack.copyIds]);
      }
      const printingIds = allPrintingIdsByTile.get(tileKey);
      if (printingIds) {
        printingIds.push(stack.printingId);
      } else {
        allPrintingIdsByTile.set(tileKey, [stack.printingId]);
      }
    }
  }

  // ── Grid click handlers ─────────────────────────────────────────────
  // When a card is split into per-set / per-rarity tiles, multiple cells share
  // a cardId, so click selection must navigate by printing to land on the tile
  // the user clicked rather than the card's first tile.
  const findBy =
    dataView === "cards" && !splitsCardIntoTiles(tileGroupBy) ? "card" : ("printing" as const);

  // Drag-overlay summary: walk items + selection for the first three unique
  // printings whose copies are selected (the fan) plus the selected-tile count
  // (the overlay label, e.g. "3 printings"). Fed into useDragPreviewStore here
  // so cells can subscribe to the fan with a stable ref — a +/- click leaves
  // `selected` untouched, so the same printing refs come back from the walk
  // and we skip the store update via the shallow compare below. Without that
  // compare, cells would re-render on every +/- since the store would publish
  // a fresh array reference every render.
  const dragSummary = computeDragSelectionSummary({
    mode,
    selected,
    items,
    stackByItemId,
    stacked,
  });
  const dragNoun = dragSelectionNoun(view);
  useEffect(() => {
    const state = useDragPreviewStore.getState();
    if (
      !printingsArrayEqual(dragSummary.printings, state.preview) ||
      dragSummary.count !== state.selectionCount ||
      dragNoun !== state.selectionNoun
    ) {
      state.setPreview(dragSummary.printings, dragSummary.count, dragNoun);
    }
  });

  const handleGridCardClick = (printing: Printing) => {
    useAddModeStore.getState().closeVariants();
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    useSiblingOverrideStore.getState().setOverride("collection", printing.cardId, printing.id);
  };

  const toggleStackForItem = (itemId: string, stack: StackedEntry) => {
    if (stacked) {
      const cardCopyIds =
        allCopyIdsByTile.get(cardsViewTileKey(stack.printing, tileGroupBy)) ?? stack.copyIds;
      toggleStack(cardCopyIds);
    } else {
      toggleSelect(itemId);
    }
  };

  // Shift-click range select. In stacked views a tile stands for every copy of
  // the card (scoped to the tile when split by set / rarity), so the range
  // accumulates copy ids; in copies view the tile is the copy.
  const shiftSelectRange = (itemId: string) => {
    const rangeIds = computeShiftRange({
      items,
      lastSelectedItemId: getLastSelectedItemId(),
      itemId,
      idsForItem: (rangeItem) => {
        if (!stacked) {
          return [rangeItem.id];
        }
        return (
          allCopyIdsByTile.get(cardsViewTileKey(rangeItem.printing, tileGroupBy)) ??
          stackByItemId.get(rangeItem.id)?.copyIds ??
          []
        );
      },
    });
    if (rangeIds === null) {
      const stack = stackByItemId.get(itemId);
      if (stack) {
        toggleStackForItem(itemId, stack);
        setLastSelectedItemId(itemId);
      }
      return;
    }
    addToSelection(rangeIds);
    setLastSelectedItemId(itemId);
  };

  // Right-click menu action on a card. See resolveContextActionTarget for the
  // browse-vs-select rules; here we apply any selection narrowing and open the
  // matching dialog on the resolved copy ids.
  const handleContextAction = (
    itemId: string,
    action: CollectionContextAction,
    printing?: Printing,
  ) => {
    const stack = stackByItemId.get(itemId);
    if (!stack) {
      return;
    }
    // Lend targets one printing, never the multi-selection: a loan row is a
    // single printing + quantity (ADR-039). It follows the cell's *displayed*
    // printing (sibling swaps included) when that variant has copies in scope,
    // falling back to the tile's representative stack — the dialog names the
    // printing either way. The stepper is capped to the copies in view; the
    // server enforces the true unclaimed bound.
    if (action === "lend") {
      const lendStack = (printing && stackByPrintingId.get(printing.id)) || stack;
      setLendTarget({
        printing: lendStack.printing,
        maxQuantity: stacked ? lendStack.copyIds.length : 1,
      });
      return;
    }
    const cardCopyIds = stacked
      ? (allCopyIdsByTile.get(cardsViewTileKey(stack.printing, tileGroupBy)) ?? stack.copyIds)
      : [itemId];
    // Copy details always targets the clicked tile (never the selection): the
    // dialog edits one copy at a time, so selection narrowing doesn't apply.
    if (action === "copyDetails") {
      const idSet = new Set(cardCopyIds);
      const printingByCopyId = new Map<string, Printing>();
      for (const entry of stacks) {
        for (const copyId of entry.copyIds) {
          if (idSet.has(copyId)) {
            printingByCopyId.set(copyId, entry.printing);
          }
        }
      }
      setCopyDetailsTarget({
        copyIds: cardCopyIds,
        cardName: legendDisplayName(stack.printing.card),
        printingByCopyId,
      });
      return;
    }
    const { copyIds, narrowSelectionTo } = resolveContextActionTarget({
      mode,
      stacked,
      itemId,
      cardCopyIds,
      selected,
    });
    if (narrowSelectionTo) {
      clearSelection();
      addToSelection(narrowSelectionTo);
      setLastSelectedItemId(itemId);
    }
    openAction(action, copyIds);
  };

  // Register table-row action handlers in the no-subscribe store so the
  // virtualized CardTable + per-cell CollectionGridCell can dispatch row
  // clicks / +/- / select-mode actions without taking these unstable closures
  // as props. Mirrors card-browser.tsx's wiring; see card-row-actions-store.ts
  // for the why. Re-register every render so rows pick up the freshest
  // implementation.
  // When the tile is split by set, the +/- variant popover offers only the
  // tile's own set so it can't add or remove a printing from another set.
  const openVariantsForTile = handleOpenVariants
    ? (printing: Printing, anchorEl: HTMLElement, intent: VariantPopoverIntent) =>
        // Cards view shows every variant of the card (scoped to the tile's set
        // when split by set); printings/copies view scopes to the one printing
        // the tile stands for.
        handleOpenVariants(printing, anchorEl, intent, tileGroupBy === "set", dataView !== "cards")
    : undefined;

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleGridCardClick,
      onSiblingClick: handleSiblingClick,
      onIncrement: handleQuickAdd,
      onDecrement: buildOnDecrement({
        dataView,
        groupBy: tileGroupBy,
        ownedPrintingIdsByTile: allPrintingIdsByTile,
        handleOpenVariants: openVariantsForTile,
        tryUndoAdd,
      }),
      onOpenVariants: openVariantsForTile,
      onItemClick: (itemId, printing, modifiers) => {
        const stack = stackByItemId.get(itemId);
        // Browse mode: ctrl-click on an owned card flips into select mode and
        // toggles. Plain click opens the detail pane.
        if (mode === "browse") {
          if (modifiers.ctrl && stack) {
            setSelectMode(true);
            toggleStackForItem(itemId, stack);
            setLastSelectedItemId(itemId);
            return;
          }
          handleGridCardClick(printing);
          return;
        }
        // Select mode: shift-click extends the range, regular click toggles.
        if (!stack) {
          return;
        }
        if (modifiers.shift) {
          shiftSelectRange(itemId);
        } else {
          toggleStackForItem(itemId, stack);
          setLastSelectedItemId(itemId);
        }
      },
      onItemToggle: (itemId) => {
        const stack = stackByItemId.get(itemId);
        if (!stack) {
          return;
        }
        toggleStackForItem(itemId, stack);
        setLastSelectedItemId(itemId);
      },
      onContextAction: handleContextAction,
      onTake: handleTake,
    });
    return () => {
      useCardRowActionsStore.getState().setHandlers({});
    };
  });

  return {
    allCopyIdsByTile,
  };
}
