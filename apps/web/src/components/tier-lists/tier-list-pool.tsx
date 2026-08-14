import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Printing } from "@openrift/shared";
import { TIER_LABEL_INK, tierColor } from "@openrift/shared";
import { useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardStrip } from "@/components/cards/card-strip";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import type { PoolCardDragData } from "@/components/tier-lists/tier-list-dnd-types";
import { TierPicker } from "@/components/tier-lists/tier-picker";
import { CountPillButton } from "@/components/ui/count-pill";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/**
 * Sections the pool never shows. Ranking is per card and has nothing to do with
 * what the creator personally owns, so the ownership filters would only be
 * noise; custom tags are a collection concept for the same reason.
 */
const POOL_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags", "copies"]);

/**
 * The card pool: the full catalogue as a standard card browser, with each cell
 * carrying its current tier. Cards stay in the pool once ranked (dimmed and
 * badged rather than removed) so a creator can see the whole set at a glance
 * and re-rank without hunting for what disappeared.
 *
 * The pool is itself a drop target: dragging a card back here unranks it.
 *
 * @returns The card pool node.
 */
export function TierListPool() {
  const { allPrintings, sets, printingsByCardId: catalogPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // "copies" is an inventory view; a tier list ranks cards, so clamp to cards.
  const view = rawView === "copies" ? "cards" : rawView;

  const { setNodeRef, isOver } = useDroppable({ id: "tier-pool", data: { type: "tier-pool" } });

  const {
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    sortBy,
    sortDir,
    view,
    groupBy,
    // A tier list ranks cards, not inventory: the owned filters are hidden here
    // (see POOL_HIDDEN_FILTER_SECTIONS), so there is no owned map to feed in.
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const items: CardViewerItem[] = sortedCards.map((printing) => ({ id: printing.id, printing }));
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogPrintingsByCardId,
    filters.languages,
  );

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, "card");
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  // Rebuilds the pool cell's rank pill for the card shown in the detail pane,
  // drawer or modal — the overlay must never hide the control it covers. On a
  // phone the drawer is the whole interaction surface, so without this a card
  // could not be ranked from its own detail view.
  const poolDetailActions = (printing: Printing) => (
    <PoolCardStrip cardId={printing.cardId} cardName={printing.card.name} />
  );

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <PoolCardCell
      item={item}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view={view}
      siblings={view === "cards" ? printingsByCardId.get(item.printing.cardId) : undefined}
      priceRange={priceRangeByCardId?.get(item.printing.cardId)}
      onClick={handleCardClick}
    />
  );

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      filterCounts={filterCounts}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={POOL_HIDDEN_FILTER_SECTIONS}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-w-0 flex-1 flex-col rounded-md transition-colors",
          isOver && "ring-ring ring-2",
        )}
      >
        <CardViewer
          items={items}
          totalItems={sortedCards.length}
          renderCard={renderCard}
          toolbar={
            <BrowserToolbar
              totalCards={totalUniqueCards}
              filteredCount={filteredCount}
              hideViewToggle
              mobileDoneLabel={hasActiveFilters ? `Show ${filteredCount} cards` : undefined}
            />
          }
          rightPane={
            isMobile ? undefined : (
              <SelectionDetailPane
                items={items}
                printingsByCardId={detailPanePrintingsByCardId}
                showImages={showImages}
                onSearchAndClose={handleSearchAndClose}
                actions={poolDetailActions}
              />
            )
          }
          addStripHeight={ADD_STRIP_HEIGHT}
        >
          <SelectionDetailOverlays
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
            actions={poolDetailActions}
          />
        </CardViewer>
      </div>
    </CardBrowserFilterProvider>
  );
}

interface PoolCardCellProps {
  item: CardViewerItem;
  ctx: CardRenderContext;
  display: ReturnType<typeof useCardThumbnailDisplay>;
  showImages: boolean;
  view: "cards" | "printings";
  siblings?: Printing[];
  priceRange?: { min: number; max: number };
  onClick: (printing: Printing) => void;
}

/**
 * One pool cell. Subscribes to its own card's tier rather than the board, so a
 * drag re-renders the one cell that changed instead of the whole grid (see the
 * `rowIndexByCardId` note in the builder store).
 *
 * @returns The pool card cell.
 */
function PoolCardCell({
  item,
  ctx,
  display,
  showImages,
  view,
  siblings,
  priceRange,
  onClick,
}: PoolCardCellProps) {
  const cardId = item.printing.cardId;
  const rowIndex = useTierListBuilderStore((state) => state.rowIndexByCardId.get(cardId) ?? null);
  const isMobile = useIsMobile();

  const dragData: PoolCardDragData = { type: "tier-pool-card", cardId };
  // Destructure before JSX: member access on the hook's return object in render
  // makes the React Compiler bail (see CLAUDE.md / DraggableCard).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `tier-pool-card-${cardId}`,
    data: dragData,
    disabled: isMobile,
  });

  return (
    <CardCell
      printing={item.printing}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view={view}
      onClick={onClick}
      siblings={siblings}
      priceRange={priceRange}
      dimmed={rowIndex !== null}
      strip={<PoolCardStrip cardId={cardId} cardName={item.printing.card.name} />}
      wrap={
        // On touch, no draggable wrap at all (same as DraggableCard): ranking
        // goes through the pill, and the wrap's `touch-none` would make the
        // whole grid impossible to pan from a card.
        isMobile ? undefined : (
          <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            // The PointerSensor needs the browser to keep sending pointer events;
            // the default touch-action would pan the grid instead.
            className="touch-none"
            style={isDragging ? { opacity: 0.4 } : undefined}
          />
        )
      }
    />
  );
}

/**
 * The pool cell's tier control: the card's current tier as a coloured pill, or
 * a "Rank" affordance when it is unranked. This is the tap path — the whole
 * builder works on a phone through it, where dragging is off.
 *
 * @returns The strip node.
 */
function PoolCardStrip({ cardId, cardName }: { cardId: string; cardName: string }) {
  // Labels are captured when the picker opens rather than subscribed to. A
  // selector returning `rows.map(...)` builds a new array every time, so it
  // would never compare equal and every cell in the grid would re-render on
  // every drag — exactly what the per-cell `rowIndex` subscription avoids. The
  // board cannot be edited while a picker is open, so the snapshot can't go stale.
  const [picker, setPicker] = useState<{ open: boolean; labels: string[] }>({
    open: false,
    labels: [],
  });
  const rowIndex = useTierListBuilderStore((state) => state.rowIndexByCardId.get(cardId) ?? null);
  const assign = useTierListBuilderStore((state) => state.assign);
  const unassign = useTierListBuilderStore((state) => state.unassign);
  const label = useTierListBuilderStore((state) =>
    rowIndex === null ? null : (state.rows[rowIndex]?.label ?? null),
  );

  const handleOpenChange = (open: boolean) => {
    setPicker({
      open,
      labels: open ? useTierListBuilderStore.getState().rows.map((row) => row.label) : [],
    });
  };

  return (
    <CardStrip
      center={
        <TierPicker
          labels={picker.labels}
          cardName={cardName}
          currentRowIndex={rowIndex}
          onPick={(index) => assign(cardId, index)}
          onUnrank={() => unassign(cardId)}
          open={picker.open}
          onOpenChange={handleOpenChange}
          trigger={
            <CountPillButton
              aria-label={label === null ? `Rank ${cardName}` : `${cardName}: tier ${label}`}
              className="max-w-16 truncate font-bold"
              style={
                label === null
                  ? undefined
                  : { backgroundColor: tierColor(rowIndex ?? 0), color: TIER_LABEL_INK }
              }
            >
              {label ?? "Rank"}
            </CountPillButton>
          }
        />
      }
    />
  );
}
