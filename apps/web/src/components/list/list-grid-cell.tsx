import type { Currency, ListKind, Printing, TradePreference } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { ListIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import type { ListEntryDragData } from "@/components/collection/dnd-types";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
import { DraggableListEntry } from "@/components/list/draggable-list-entry";
import { ListEntryContextMenu } from "@/components/list/list-entry-context-menu";
import { TradePreferenceGridPill } from "@/components/trade-preferences/trade-preference-grid-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dispatchEntryQuantityChange,
  dispatchIncrement,
  dispatchItemClick,
  dispatchItemToggle,
  dispatchListBulkAction,
  dispatchRemoveEntry,
  dispatchSetPreference,
  dispatchSiblingClick,
  isQuantityPending,
} from "@/stores/card-row-actions-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { useListEntriesStore } from "@/stores/list-entries-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

interface ListGridCellProps {
  /** The grid item's underlying printing (pre-override-resolution). */
  printing: Printing;
  /** Grid item identifier (printingId, cardId-first-sibling, or copyId per kind/view). */
  itemId: string;
  /** Layout dimensions + load priority from the row. Primitive props avoid
   * the row's `.map`-built ctx object busting the cell's memo on every
   * parent render. isSelected / isFlashing are resolved per-cell below. */
  cardWidth: number;
  priority: boolean;
  /** "cards" | "printings"; "copies" is collapsed to "printings" at the data level. */
  dataView: "cards" | "printings";
  /** Locked view per the list's kind: cards/printings/copies. */
  view: "cards" | "printings" | "copies";
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listId: string;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  /** Browse renders +/-, drag, and trade controls; select renders a checkbox. */
  mode: "browse" | "select";
  /** True when the grid is rendering the catalog (library mode). */
  showLibrary: boolean;
  supportsTradePrefs: boolean;
  /** Catalog siblings for this card (cards view, otherwise undefined). */
  siblings: Printing[] | undefined;
  display: CardThumbnailDisplay;
  showImages: boolean;
  priceRange?: { min: number; max: number };
}

/**
 * Per-cell wrapper for /lists grid tiles. Self-subscribes to its own
 * sibling-swap override and entry data so the parent's `.map()` stays stable
 * across entry mutations — only the cell whose entry actually changed
 * re-renders. Click / quantity / remove / set-preference actions hand off
 * through dispatchers in {@link useCardRowActionsStore}.
 *
 * Wrapped in `React.memo`: every prop is primitive or comes from a
 * reference-stable source (printing/siblings from useCards, display from
 * useCardThumbnailDisplay's "use memo"), so shallow equality reliably skips
 * unchanged cells when an unrelated entry mutates.
 *
 * @returns The card cell with its strip, drag wrap, and context menu.
 */
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
export const ListGridCell = memo(function ListGridCell({
  printing,
  itemId,
  cardWidth,
  priority,
  dataView,
  view,
  kind,
  listId,
  intent,
  listTradeDefaults,
  listCurrency,
  mode,
  showLibrary,
  supportsTradePrefs,
  siblings,
  display,
  showImages,
  priceRange,
}: ListGridCellProps) {
  const inCardsView = view === "cards";
  const inSelectMode = mode === "select";

  // Per-cell focus + flash subscriptions (granular selectors return
  // identity-equal booleans for cells that didn't toggle).
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

  // Per-cell sibling-swap override. Only re-fires when THIS card's override
  // changes — pins on other cards in the same grid are ignored here.
  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.list.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  // Per-cell entry lookup. The store carries both indexes; the cell picks
  // based on whether items come from the catalog (library mode) or the
  // entries themselves (browse mode). Object.is on the returned entry ref
  // means cells whose entry didn't mutate skip re-render.
  const key = kind === "card" ? printing.cardId : displayPrinting.id;
  const entry = useListEntriesStore((s) =>
    showLibrary ? s.entryByKey.get(key) : s.entryByItemId.get(itemId),
  );

  // Selection keyed by entry id (one tile = one entry). The selector returns a
  // bare boolean, so only the cell whose selection flipped re-renders.
  const isItemSelected = useGridSelectionStore(
    (state) => inSelectMode && entry !== undefined && state.selected.has(entry.id),
  );

  // Select mode hides the browse controls (quantity stepper, trade pill) and
  // the drag wrap, and shows a checkbox instead — mirrors /collections.
  const strip = inSelectMode
    ? undefined
    : buildStrip({
        showLibrary,
        kind,
        entry,
        displayPrinting,
        listTradeDefaults,
        listCurrency,
        supportsTradePrefs,
      });

  // Drag wiring: browse-mode tiles with a backing entry are draggable. The
  // drag payload is the single entry the tile represents — buildItems
  // guarantees a 1:1 mapping in browse mode.
  const dragData: ListEntryDragData | undefined = entry
    ? {
        type: "list-entry",
        entryIds: [entry.id],
        sourceListId: listId,
        sourceKind: kind,
        sourceIntent: intent,
        totalQuantity: entry.quantity,
        printing,
        cardName: entry.cardName,
      }
    : undefined;
  const dragId = entry ? `list-entry-${entry.id}` : undefined;
  const wrap =
    !inSelectMode && !showLibrary && dragData && dragId ? (
      <DraggableListEntry id={dragId} data={dragData} />
    ) : undefined;

  // Move / take-off act on the current selection when this entry is part of it,
  // otherwise just this entry — the browser resolves which via the bulk-action
  // handler. Trade preference stays single-entry. Copy-kind tradelists use
  // "Take off list…" (a keep-vs-sold chooser); other kinds get a plain Remove.
  const contextMenu = entry ? (
    <ListEntryContextMenu
      onRemove={kind === "copy" ? undefined : () => dispatchListBulkAction(entry.id, "remove")}
      onTakeOff={kind === "copy" ? () => dispatchListBulkAction(entry.id, "takeOff") : undefined}
      onMove={() => dispatchListBulkAction(entry.id, "move")}
      onSetPreference={supportsTradePrefs ? () => dispatchSetPreference(entry.id) : undefined}
    />
  ) : undefined;

  const leftOverlay =
    inSelectMode && entry ? (
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
      onClick={(clicked, event) =>
        dispatchItemClick(itemId, clicked, {
          shift: event?.shiftKey ?? false,
          ctrl: event?.ctrlKey ?? false,
        })
      }
      onSiblingClick={dispatchSiblingClick}
      siblings={inCardsView ? siblings : undefined}
      priceRange={priceRange}
      dimmed={showLibrary && (entry?.quantity ?? 0) === 0}
      stripSlot={showLibrary ? "topSlot" : undefined}
      strip={strip}
      leftOverlay={leftOverlay}
      contextMenu={contextMenu}
      wrap={wrap}
    />
  );
});

interface BuildStripArgs {
  showLibrary: boolean;
  kind: ListKind;
  entry: ReturnType<typeof useListEntriesStore.getState>["entryByItemId"] extends Map<
    string,
    infer V
  >
    ? V | undefined
    : never;
  displayPrinting: Printing;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  supportsTradePrefs: boolean;
}

function buildStrip({
  showLibrary,
  kind,
  entry,
  displayPrinting,
  listTradeDefaults,
  listCurrency,
  supportsTradePrefs,
}: BuildStripArgs): ReactNode {
  if (showLibrary) {
    // Library mode: + adds to the list (bulk-add upserts by key), - decrements
    // the existing entry, and at quantity 1 removes it outright (dropping to 0).
    // Disabled only when there's nothing on the list yet (count 0).
    const displayedCount = entry?.quantity ?? 0;
    return (
      <CardCountStrip
        count={displayedCount}
        icon={ListIcon}
        decrement={{
          onClick: () =>
            entry && displayedCount <= 1
              ? dispatchRemoveEntry(entry.id, legendDisplayName(displayPrinting.card))
              : dispatchEntryQuantityChange(entry?.id ?? "", displayedCount - 1),
          disabled: displayedCount === 0,
          ariaLabel: `Decrease ${legendDisplayName(displayPrinting.card)} quantity on list`,
        }}
        increment={{
          onClick: () => dispatchIncrement(displayPrinting),
          ariaLabel: `Add ${legendDisplayName(displayPrinting.card)} to list`,
        }}
      />
    );
  }

  if (!entry) {
    return null;
  }

  const tradePill = supportsTradePrefs ? (
    <TradePreferenceGridPill
      override={entry.tradeOverride}
      listDefault={listTradeDefaults}
      currency={listCurrency}
      isOverridden={
        entry.tradeOverride.pricePref !== null ||
        entry.tradeOverride.priceAbsoluteCents !== null ||
        entry.tradeOverride.tradeType !== null
      }
      onEdit={() => dispatchSetPreference(entry.id)}
    />
  ) : null;

  if (kind === "copy") {
    // Copy-kind (tradelists): no count, no stepper. Surface a take-off button
    // so it isn't hidden behind the context menu. It opens the keep-vs-sold
    // chooser rather than removing outright, since taking a copy off a tradelist
    // has two outcomes (kept vs sold). The trade pill stays dead-centered while
    // the "Reserved" badge (when the copy is pinned to a live trade) and the
    // take-off button float to the edges, so an uneven-width badge can't shove
    // the pill off-center. `entry` is guaranteed non-null here.
    const reserved = entry.kind === "copy" && entry.reserved;
    return (
      <div className="relative z-30 mb-1 flex h-5 items-center justify-center">
        {reserved && (
          <Badge variant="success" className="absolute top-1/2 left-0 -translate-y-1/2">
            Reserved
          </Badge>
        )}
        {tradePill}
        <Button
          type="button"
          tabIndex={-1}
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive absolute top-1/2 right-0 -translate-y-1/2"
          onClick={(event) => {
            event.stopPropagation();
            dispatchListBulkAction(entry.id, "takeOff");
          }}
          aria-label={`Take ${entry.cardName} off list`}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  const isPending = isQuantityPending(entry.id);
  return (
    <CardCountStrip
      count={entry.quantity}
      decrement={{
        onClick: () =>
          entry.quantity <= 1
            ? dispatchRemoveEntry(entry.id, entry.cardName)
            : dispatchEntryQuantityChange(entry.id, entry.quantity - 1),
        disabled: isPending,
        ariaLabel: `Decrease ${entry.cardName} quantity`,
      }}
      increment={{
        onClick: () => dispatchEntryQuantityChange(entry.id, entry.quantity + 1),
        disabled: isPending,
        ariaLabel: `Increase ${entry.cardName} quantity`,
      }}
      extras={tradePill}
    />
  );
}
