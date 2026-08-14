import type { Printing } from "@openrift/shared";
import type { ComponentType, ReactNode, Ref } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
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

/**
 * Sections a picker never shows. What the creator personally owns has nothing
 * to do with which cards they want to rank or talk about, and custom tags are a
 * collection concept for the same reason.
 */
const PICKER_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "customTags",
  "copies",
]);

/**
 * Views a picker offers. "copies" is an inventory view over what you own, which
 * is not what any picker is choosing between, so it is clamped away.
 */
type PickerView = "cards" | "printings";

/** Everything a picker's cell needs; the surface supplies the component. */
export interface PickerCellProps {
  item: CardViewerItem;
  ctx: CardRenderContext;
  display: ReturnType<typeof useCardThumbnailDisplay>;
  showImages: boolean;
  view: PickerView;
  siblings?: Printing[];
  priceRange?: { min: number; max: number };
  onClick: (printing: Printing) => void;
}

interface PickerCardBrowserProps {
  /**
   * The cell component. Deliberately a component rather than a render function:
   * a cell subscribes to its own slice of the surface's store (its tier, its
   * queue count), and that subscription has to live inside a component of its
   * own or every cell in the grid re-renders on every pick.
   */
  cell: ComponentType<PickerCellProps>;
  /**
   * Rebuilds the cell's pick control for the card shown in the detail pane,
   * drawer or modal, so an overlay never hides the control it covers. On a
   * phone the drawer is the whole interaction surface, so without this a card
   * could not be picked from its own detail view.
   */
  detailActions: (printing: Printing, view: PickerView) => ReactNode;
  /** Drops the cards/printings toggle for a surface that only deals in cards. */
  hideViewToggle?: boolean;
  /** Ref on the browser's own container, e.g. a drop target that unranks. */
  containerRef?: Ref<HTMLDivElement>;
  /** Extra classes on that container. */
  className?: string;
}

/**
 * The catalogue as a standard card browser with a pick control on every cell.
 *
 * This is the shared half of the tier-list pool and the presentation queue
 * builder: both filter the whole catalogue down to a set, a domain or a keyword
 * and then choose cards one at a time, and everything about how that browser is
 * assembled — the filter chrome, the data hook, the detail pane and its
 * overlays — is the same on both. What differs is only what a cell offers, which
 * arrives as `cell` and `detailActions`.
 *
 * Deliberately subscribes to no pick state of its own. The counts and rank pills
 * live on the cells, so picking a card never re-renders the grid around it.
 *
 * @returns The browser node.
 */
export function PickerCardBrowser({
  cell: Cell,
  detailActions,
  hideViewToggle,
  containerRef,
  className,
}: PickerCardBrowserProps) {
  const { allPrintings, sets, printingsByCardId: catalogPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const view: PickerView = rawView === "copies" ? "cards" : rawView;

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
    // The owned filters are hidden here (see PICKER_HIDDEN_FILTER_SECTIONS), so
    // there is no owned map to feed in.
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

  const actions = (printing: Printing) => detailActions(printing, view);

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <Cell
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
      hiddenSections={PICKER_HIDDEN_FILTER_SECTIONS}
    >
      <div ref={containerRef} className={cn("flex min-w-0 flex-1 flex-col", className)}>
        <CardViewer
          items={items}
          totalItems={sortedCards.length}
          renderCard={renderCard}
          toolbar={
            <BrowserToolbar
              totalCards={totalUniqueCards}
              filteredCount={filteredCount}
              hideViewToggle={hideViewToggle}
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
                actions={actions}
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
            actions={actions}
          />
        </CardViewer>
      </div>
    </CardBrowserFilterProvider>
  );
}
