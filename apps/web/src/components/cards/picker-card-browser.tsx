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
import { splitsCardIntoTiles, tileSiblings } from "@/lib/card-tiles";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

const PICKER_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "customTags",
  "copies",
]);

type PickerView = "cards" | "printings";

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
  cell: ComponentType<PickerCellProps>;
  detailActions: (printing: Printing, view: PickerView) => ReactNode;
  hideViewToggle?: boolean;
  containerRef?: Ref<HTMLDivElement>;
  className?: string;
}

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

  const {
    filters,
    sortBy,
    sortDir,
    view: rawView,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
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

  // A split grouping renders one tile per (card, group), so a click must find its
  // cell by printing, not card, or it jumps to the first tile carrying that card.
  const inCardsView = view === "cards";
  const findBy: "card" | "printing" =
    inCardsView && !splitsCardIntoTiles(groupBy) ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
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
      siblings={
        inCardsView
          ? tileSiblings(item.printing, printingsByCardId.get(item.printing.cardId), groupBy)
          : undefined
      }
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
          setOrder={sets}
          groupBy={groupBy}
          groupDir={groupDir}
          toolbar={
            <BrowserToolbar
              totalCards={totalUniqueCards}
              filteredCount={filteredCount}
              hideViewToggle={hideViewToggle}
              hideDisplayModeToggle
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
