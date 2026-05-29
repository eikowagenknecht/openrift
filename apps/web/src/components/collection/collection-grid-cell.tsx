import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { memo } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { BrowseLocationsPopover } from "@/components/collection/browse-locations-popover";
import { DraggableCard } from "@/components/collection/draggable-card";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
import { useOwnedCopyIdsForPrintings, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import {
  dispatchDecrement,
  dispatchIncrement,
  dispatchItemClick,
  dispatchItemToggle,
  dispatchOpenVariants,
  dispatchSiblingClick,
} from "@/stores/card-row-actions-store";
import { useDragPreviewStore } from "@/stores/drag-preview-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

interface CollectionGridCellProps {
  /** Item's underlying printing (pre-override-resolution). */
  printing: Printing;
  /** Item identifier (printingId for stacked items, copyId for copies view). */
  itemId: string;
  /** Layout dimensions and load priority from the row — primitive props so
   * a fresh `ctx` object literal in the row's `.map` doesn't bust this
   * cell's memo. `isSelected` / `isFlashing` come from a per-cell store
   * subscription instead. */
  cardWidth: number;
  priority: boolean;
  dataView: "cards" | "printings";
  mode: "browse" | "select";
  /** True when the grid is showing the whole catalog (library mode). */
  showLibrary: boolean;
  /** True for cards/printings view; false for "copies" expansion. */
  stacked: boolean;
  /** Catalog siblings for the cell's card (cards view, otherwise undefined). */
  siblings: Printing[] | undefined;
  /** Active collection id, or undefined on the all-collections aggregate. */
  collectionId: string | undefined;
  display: CardThumbnailDisplay;
  showImages: boolean;
  priceRange?: { min: number; max: number };
}

/**
 * Per-cell wrapper for /collections grid tiles. Self-subscribes to its own
 * owned count, sibling-swap override, and selection state so the parent's
 * `.map()` closure stays stable across +/-, sibling clicks, and select
 * toggles — only the cell whose data actually changed re-renders.
 *
 * Wrapped in `React.memo`: every prop is a primitive or a reference-stable
 * value (item.printing comes from useCards, siblings/priceRange from
 * useCardData with "use memo"), so shallow equality reliably skips
 * unchanged cells. React Compiler caches expressions inside the component
 * but does not skip the function call itself — the explicit memo closes
 * that gap, the same way CardRowContent does in card-grid.tsx.
 *
 * Click/select/drag actions hand off to module-stable dispatchers in
 * {@link useCardRowActionsStore}; the parent registers handlers there each
 * render and reads them at dispatch time.
 *
 * @returns The card cell with its strip, owned-count, selection overlay, and
 *   drag wrap.
 */
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
export const CollectionGridCell = memo(function CollectionGridCell({
  printing,
  itemId,
  cardWidth,
  priority,
  dataView,
  mode,
  showLibrary,
  stacked,
  siblings,
  collectionId,
  display,
  showImages,
  priceRange,
}: CollectionGridCellProps) {
  const inCardsView = dataView === "cards";

  // Per-cell focus + flash subscriptions. The store-backed lookups return
  // identity-equal booleans for every cell except the one whose match
  // flipped, so only that cell re-renders when the user navigates the
  // detail pane or the flash fires.
  const isSelected = useGridFocusStore(
    (s) => s.selectedItemId === itemId || s.selectedItemId === printing.id,
  );
  const isFlashing = useGridFocusStore(
    (s) => s.flashCardId === itemId || s.flashCardId === printing.id,
  );
  const resolvedCtx: CardRenderContext = {
    isSelected,
    isFlashing,
    cardWidth,
    priority,
  };

  // Per-cell sibling-swap override. Only resubscribes when this card's
  // override moves — siblings of unrelated cards don't trigger renders here.
  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.collection.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  // In-collection counts via per-cell live query. siblingIds is the cell's
  // card's catalog siblings in cards view, or just this printing's id in
  // printings view — where each printing is its own cell, so it must never
  // fold in copies from other printings of the same card (that would make a
  // single-printing select fail the "every copy selected" checkbox test).
  const siblingIds = inCardsView && siblings ? siblings.map((s) => s.id) : [displayPrinting.id];
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, true, collectionId);

  // Per-cell copy IDs for select-mode toggles and drag wrap. The underlying
  // live query is the same shape as the counts hook above, so subscribing to
  // both is cheap (TanStack DB shares the live query plumbing).
  const { data: cardCopyIds } = useOwnedCopyIdsForPrintings(siblingIds, true, collectionId);

  const ownedCount = counts?.totals[displayPrinting.id] ?? 0;
  const totalInCollection =
    counts && inCardsView && siblings && siblings.length > 1 ? counts.total : undefined;
  const cardTotalInCollection = counts?.total ?? 0;

  // Selection: cell is selected when every effective copy id is in `selected`.
  // The selector compares the boolean result, so only flipping THIS cell's
  // selection state triggers a render.
  const effectiveCopyIds = cardCopyIds ?? [];
  const isItemSelected = useGridSelectionStore((state) => {
    if (mode !== "select") {
      return false;
    }
    if (stacked) {
      return effectiveCopyIds.length > 0 && effectiveCopyIds.every((id) => state.selected.has(id));
    }
    return state.selected.has(itemId);
  });

  const variantTrigger =
    inCardsView && (siblings?.length ?? 0) > 1
      ? (event: { currentTarget: HTMLElement }) =>
          dispatchOpenVariants(displayPrinting, event.currentTarget, "add")
      : undefined;

  // Strip variants:
  //  - browse + owned: full +/-, BrowseLocationsPopover (variants + locations)
  //  - browse + unowned (library): + only, no popover
  //  - select + owned: read-only count, OwnedCollectionsPopover
  //  - select + unowned: no strip (nothing to display)
  let strip: ReactNode | undefined;
  if (mode === "browse") {
    const pillOverride =
      ownedCount > 0 ? (
        <BrowseLocationsPopover
          displayedPrinting={displayPrinting}
          siblings={inCardsView ? siblings : undefined}
          ownedCount={ownedCount}
          totalCount={totalInCollection}
          ownedCountByPrinting={counts?.allTotals}
          onAdd={(p) => dispatchIncrement(p)}
          onUndoAdd={(p, anchorEl) => dispatchDecrement(p, anchorEl)}
        />
      ) : undefined;
    strip = (
      <CardCountStrip
        count={ownedCount}
        totalCount={totalInCollection}
        decrement={
          ownedCount > 0
            ? {
                onClick: (event) => dispatchDecrement(displayPrinting, event.currentTarget),
                ariaLabel: `Remove ${displayPrinting.card.name}`,
              }
            : undefined
        }
        increment={{
          onClick: () => dispatchIncrement(displayPrinting),
          ariaLabel: `Add ${displayPrinting.card.name}`,
        }}
        pillOverride={pillOverride}
        onPillClick={!pillOverride && variantTrigger ? variantTrigger : undefined}
        pillAriaLabel={
          !pillOverride && variantTrigger
            ? `Choose variant for ${displayPrinting.card.name}`
            : undefined
        }
      />
    );
  } else if (ownedCount > 0 || cardTotalInCollection > 0) {
    strip = (
      <CardCountStrip
        count={ownedCount}
        totalCount={totalInCollection}
        pillOverride={
          <OwnedCollectionsPopover
            printingId={displayPrinting.id}
            cardName={displayPrinting.card.name}
            shortCode={displayPrinting.shortCode}
            count={ownedCount}
            totalCount={totalInCollection}
            siblings={inCardsView ? siblings : undefined}
          />
        }
      />
    );
  }

  // Drag wrap: only owned cells get a drag (need at least one copy to move).
  // A cell that's part of the active multi-selection drags the whole selection,
  // not just its own copies, but it can't know the full selection here without
  // subscribing to (and re-rendering on) every selection change. So it flags
  // `fromSelection` and the route resolves the live copy IDs at grab/drop time
  // (see resolveSelectionDrag). `ownCopyIds` is the fallback for an unselected
  // tile, which drags only its own stack (or single copy in copies view).
  // Preview comes from the shared drag-preview store (parent rebuilds on
  // selection changes only, so a +/- click leaves this reference identical
  // and skips the cell's drag-wrap re-render). Falls back to the displayed
  // printing when no select-mode preview is active.
  const dragPreview = useDragPreviewStore((s) => s.preview);
  const ownCopyIds = stacked ? effectiveCopyIds : [itemId];
  const isStackDrag = !isItemSelected && stacked && ownCopyIds.length > 1;
  const previewPrintings = dragPreview.length > 0 ? dragPreview : [displayPrinting];
  const wrap =
    ownCopyIds.length > 0 ? (
      <DraggableCard
        id={itemId}
        copyIds={ownCopyIds}
        fromSelection={isItemSelected}
        isStackDrag={isStackDrag}
        printing={displayPrinting}
        previewPrintings={previewPrintings}
        sourceCollectionId={collectionId}
      />
    ) : undefined;

  const handleClick = (clicked: Printing, event?: { shiftKey: boolean; ctrlKey: boolean }) => {
    dispatchItemClick(itemId, clicked, {
      shift: event?.shiftKey ?? false,
      ctrl: event?.ctrlKey ?? false,
    });
  };

  const leftOverlay =
    mode === "select" && cardTotalInCollection > 0 ? (
      <>
        <SelectionCheckbox
          isSelected={isItemSelected}
          onToggle={() => dispatchItemToggle(itemId)}
        />
        {isItemSelected && (
          <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
        )}
      </>
    ) : undefined;

  return (
    <CardCell
      printing={displayPrinting}
      ctx={resolvedCtx}
      display={display}
      showImages={showImages}
      view={dataView}
      onClick={handleClick}
      onSiblingClick={(p) => dispatchSiblingClick(p)}
      siblings={inCardsView ? siblings : undefined}
      priceRange={showLibrary ? priceRange : undefined}
      dimmed={cardTotalInCollection === 0}
      strip={strip}
      leftOverlay={leftOverlay}
      wrap={wrap}
    />
  );
});
