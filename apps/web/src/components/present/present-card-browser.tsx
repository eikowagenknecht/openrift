import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { CountPill } from "@/components/ui/count-pill";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { useDisplayStore } from "@/stores/display-store";
import { usePresentQueueStore } from "@/stores/present-queue-store";
import { useSelectionStore } from "@/stores/selection-store";

/**
 * Sections the queue browser never shows. What a creator owns has nothing to
 * do with what they want to talk about on stream, and custom tags are a
 * collection concept for the same reason.
 */
const QUEUE_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "customTags",
  "copies",
]);

/**
 * The queue cell's add control: how many times this printing is queued, with a
 * plus to add another stop and a minus to take the last one back.
 *
 * Subscribes to its own printing's count rather than the queue, so an add
 * re-renders the one cell that changed instead of the whole grid — the same
 * reason the tier-list pool subscribes per card (see CLAUDE.md).
 *
 * @returns The strip node.
 */
function QueueCardStrip({ printing }: { printing: Printing }) {
  const queued = usePresentQueueStore((state) => state.countByPrintingId.get(printing.id) ?? 0);
  const isFull = usePresentQueueStore((state) => state.ids.length >= MAX_QUEUE_LENGTH);
  const add = usePresentQueueStore((state) => state.add);
  const removePrinting = usePresentQueueStore((state) => state.removePrinting);

  return (
    <CardStrip
      left={
        queued > 0 && (
          <StripIconButton
            aria-label={`Remove ${printing.card.name} from the queue`}
            onClick={() => removePrinting(printing.id)}
          >
            <MinusIcon className="size-3" />
          </StripIconButton>
        )
      }
      center={
        queued > 0 && (
          <CountPill variant="primary" title={`${queued} in the queue`}>
            <span>{queued}</span>
            <span className="sr-only">in the queue</span>
          </CountPill>
        )
      }
      right={
        <StripIconButton
          aria-label={`Add ${printing.card.name} to the queue`}
          disabled={isFull}
          onClick={() => add(printing.id)}
        >
          <PlusIcon className="size-3" />
        </StripIconButton>
      }
    />
  );
}

interface QueueCardCellProps {
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
 * One cell of the queue browser. Dimmed once the printing is queued, so a
 * creator scanning a set can see at a glance what they have already picked.
 *
 * @returns The card cell.
 */
function QueueCardCell({
  item,
  ctx,
  display,
  showImages,
  view,
  siblings,
  priceRange,
  onClick,
}: QueueCardCellProps) {
  const queued = usePresentQueueStore(
    (state) => (state.countByPrintingId.get(item.printing.id) ?? 0) > 0,
  );

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
      dimmed={queued}
      strip={<QueueCardStrip printing={item.printing} />}
    />
  );
}

/**
 * The catalogue as a standard card browser, with an add control on every cell.
 *
 * This is how a queue gets built: filter to a set, a domain, a keyword, or
 * whatever the segment is about, then pick the cards individually. The
 * printings view is deliberately left available — which printing goes on the
 * stage is often the whole point of showing it.
 *
 * Deliberately subscribes to no queue state of its own. The counts live on the
 * cells, so adding a card never re-renders the grid around it.
 *
 * @returns The browser node.
 */
export function PresentCardBrowser() {
  const { allPrintings, sets, printingsByCardId: catalogPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // "copies" is an inventory view over what you own; a queue is about cards
  // going on screen, so clamp it to the card view.
  const view = rawView === "copies" ? "cards" : rawView;

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
    // The owned filters are hidden here (see QUEUE_HIDDEN_FILTER_SECTIONS), so
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

  // Rebuilds the cell's add control for the card shown in the detail pane,
  // drawer or modal, so the overlay never hides the control it covers. On a
  // phone the drawer is the whole interaction surface, so without this a card
  // could not be queued from its own detail view.
  const detailActions = (printing: Printing) => <QueueCardStrip printing={printing} />;

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <QueueCardCell
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
      hiddenSections={QUEUE_HIDDEN_FILTER_SECTIONS}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <CardViewer
          items={items}
          totalItems={sortedCards.length}
          renderCard={renderCard}
          toolbar={
            <BrowserToolbar
              totalCards={totalUniqueCards}
              filteredCount={filteredCount}
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
                actions={detailActions}
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
            actions={detailActions}
          />
        </CardViewer>
      </div>
    </CardBrowserFilterProvider>
  );
}
