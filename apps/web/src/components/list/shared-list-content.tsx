import type {
  ListEntryDetailResponse,
  ListKind,
  Printing,
  PublicListDetailResponse,
} from "@openrift/shared";
import { HeartIcon, ListIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserActiveFilters,
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE } from "@/components/cards/count-pill";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import { RequestFromTradelistDialog } from "@/components/friend-groups/request-from-tradelist-dialog";
import type { TradelistRequestContext } from "@/components/friend-groups/request-from-tradelist-dialog";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { ListHeader } from "@/components/list/list-header";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { FilterSearchProvider, useFilterSearch } from "@/lib/search-schemas";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

// Public visitor has no owned-count context; lists also don't carry catalog-
// wide channels / markers / custom-tag assignments. Match the public
// collection share's hidden set.
function SharedListQuantityCell({
  itemId,
  entryByItemId,
}: {
  printing?: Printing;
  itemId?: string;
  entryByItemId: Map<string, ListEntryDetailResponse>;
}) {
  if (!itemId) {
    return null;
  }
  return <StaticCountTableActions count={entryByItemId.get(itemId)?.quantity ?? 0} />;
}

const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "markers",
  "channels",
  "customTags",
]);

interface SharedListContentProps {
  data: PublicListDetailResponse;
  /** Back arrow rendered as the first slot inside the list header. */
  backLink?: React.ReactNode;
  /**
   * Enables the per-card "I want this" request flow. Passed only by the
   * friend-group shared-list route, and only for a trade-intent list viewed by
   * someone other than its owner — never on the public share route.
   */
  trade?: TradelistRequestContext;
}

/**
 * Public list browser: header + virtualised card grid. Shared between the
 * per-list public share route, the user-bundle nested list route, and the
 * friend-group shared-list route.
 *
 * @returns The full page body.
 */
export function SharedListContent({ data, backLink, trade }: SharedListContentProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const { list, owner, entries } = data;

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
          <ListHeader
            list={list}
            entries={entries}
            attribution={{ kind: "owner", ownerName: owner.displayName }}
            backLink={backLink}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
          <SharedListBody data={data} trade={trade} />
        </div>
      </div>
    </PageTopBarHeightContext>
  );
}

function SharedListBody({
  data,
  trade,
}: {
  data: PublicListDetailResponse;
  trade?: TradelistRequestContext;
}) {
  const hydrated = useHydrated();
  // The top bar renders before hydration (so crawlers see the name + owner).
  // The grid depends on the global catalog (useCards) plus client-only
  // display + filter state, so defer that subtree.
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground py-3 text-sm">Loading cards…</p>}>
      <SharedListGrid data={data} trade={trade} />
    </Suspense>
  );
}

function SharedListGrid({
  data,
  trade,
}: {
  data: PublicListDetailResponse;
  trade?: TradelistRequestContext;
}) {
  const { entries, list } = data;
  const { printingsById, printingsByCardId, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  // The printing whose "I want this" dialog is open (trade surfaces only).
  const [requestPrinting, setRequestPrinting] = useState<Printing | null>(null);

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const filterSearch = useFilterSearch();
  // Public share mirrors the authenticated list page: the view is locked to
  // the list's kind, and the view-mode toggle is hidden in the toolbar.
  const view: "cards" | "printings" | "copies" = kindToView(list.kind);
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  // Card-kind fan: scope the catalog map to the user's preferred languages
  // so a public viewer sees the printings they care about, not every
  // language reprint. Empty prefs means show all.
  const userLanguages = useDisplayStore((state) => state.languages);
  const userScopedPrintingsByCardId = filterPrintingsByLanguages(printingsByCardId, userLanguages);

  const {
    sortedCards,
    printingsByCardId: filteredPrintingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings: listPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const items: CardViewerItem[] = [];
  const entryByItemId = new Map<string, ListEntryDetailResponse>();
  if (view === "copies") {
    for (const sortedPrinting of sortedCards) {
      for (const entry of entriesByPrintingId.get(sortedPrinting.id) ?? []) {
        items.push({ id: entry.id, printing: sortedPrinting });
        entryByItemId.set(entry.id, entry);
      }
    }
  } else {
    for (const sortedPrinting of sortedCards) {
      items.push({ id: sortedPrinting.id, printing: sortedPrinting });
      const first = entriesByPrintingId.get(sortedPrinting.id)?.[0];
      if (first) {
        entryByItemId.set(sortedPrinting.id, first);
      }
    }
  }

  const findBy: "card" | "printing" = view === "cards" && groupBy !== "set" ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    // Card-kind lists fan every printing of the card behind the tile,
    // scoped to the user's preferred languages. Other kinds stay scoped to
    // printings actually on the list.
    const siblings =
      view === "cards"
        ? (list.kind === "card" ? userScopedPrintingsByCardId : filteredPrintingsByCardId).get(
            cardId,
          )
        : undefined;
    // Surface the per-entry quantity so a visitor can see "I want 4 of this".
    // Copy-kind lists have implicit quantity 1 per entry, so the strip
    // adds nothing there.
    const entry = entryByItemId.get(item.id);
    // A copy already pinned to a live trade can't be requested again, so the
    // Want button is disabled and a "Reserved" badge marks it (mirrors the
    // owner's tradelist). The match view already hides reserved copies; here
    // the badge explains why a card you can see isn't matchable.
    const reserved = entry?.kind === "copy" && entry.reserved;
    // On a tradelist the viewer can request a card: the strip becomes a "Want"
    // button instead of the read-only quantity pill. Trade lists are copy-kind,
    // so this never collides with the count strip below.
    const strip = trade ? (
      <WantStrip onClick={() => setRequestPrinting(item.printing)} disabled={reserved} />
    ) : entry && list.kind !== "copy" ? (
      <CardCountStrip count={entry.quantity} icon={ListIcon} />
    ) : undefined;
    return (
      <CardCell
        printing={item.printing}
        ctx={ctx}
        display={display}
        showImages={showImages}
        view={dataView}
        onClick={handleCardClick}
        siblings={siblings}
        priceRange={priceRangeByCardId?.get(cardId)}
        strip={strip}
        leftOverlay={
          reserved ? (
            <Badge
              variant="success"
              className="pointer-events-none absolute top-1.5 right-1.5 z-20"
            >
              Reserved
            </Badge>
          ) : undefined
        }
      />
    );
  };

  const totalDisplay = view === "copies" ? items.length : totalUniqueCards;
  const filteredDisplay = view === "copies" ? items.length : filteredCount;

  const toolbar = (
    <BrowserToolbar
      totalCards={totalDisplay}
      filteredCount={filteredDisplay}
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredDisplay} ${view === "cards" ? "cards" : view === "copies" ? "copies" : "printings"}`
          : undefined
      }
      hideViewToggle
    />
  );

  const leftPane = <BrowserLeftPane />;
  const aboveGrid = <BrowserActiveFilters />;

  // Card-kind lists fan out every printing of the clicked card in the detail
  // pane (the entry doesn't pin a specific printing), scoped to the user's
  // preferred languages. Other kinds stay scoped to what's on the list.
  const detailPanePrintingsByCardId =
    list.kind === "card" ? userScopedPrintingsByCardId : filteredPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (listPrintings.length === 0) {
    const KindIcon = listKindIcon(list.kind);
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia>
            <KindIcon className="size-16 opacity-50" />
          </EmptyMedia>
          <EmptyTitle>{emptyTitleFor(list.kind)}</EmptyTitle>
          <EmptyDescription>Check back later.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Override the filter-search `view` so the SearchBar's "Search X..." label
  // and unit count match the locked view. Without this it falls back to the
  // URL/default ("cards") on printing- and copy-kind lists.
  return (
    <FilterSearchProvider value={{ ...filterSearch, view }}>
      <CardBrowserFilterProvider
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        filterCounts={filterCounts}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
      >
        <CardViewer
          items={items}
          totalItems={view === "copies" ? entries.length : listPrintings.length}
          renderCard={renderCard}
          toolbar={toolbar}
          leftPane={leftPane}
          aboveGrid={aboveGrid}
          rightPane={rightPane}
          addStripHeight={ADD_STRIP_HEIGHT}
          table={
            trade
              ? {
                  actionsColumn: "narrow",
                  actionsLabel: "Trade",
                  actionsCell: (
                    <TradelistRequestActionsCell
                      entryByItemId={entryByItemId}
                      onRequest={setRequestPrinting}
                    />
                  ),
                }
              : list.kind === "copy"
                ? { actionsColumn: "none" }
                : {
                    actionsColumn: "narrow",
                    actionsLabel: "Qty",
                    actionsCell: <SharedListQuantityCell entryByItemId={entryByItemId} />,
                  }
          }
        >
          {isMobile && (
            <SelectionMobileOverlay
              items={items}
              printingsByCardId={detailPanePrintingsByCardId}
              showImages={showImages}
              onSearchAndClose={handleSearchAndClose}
            />
          )}
        </CardViewer>
        {trade ? (
          <RequestFromTradelistDialog
            open={requestPrinting !== null}
            onOpenChange={(open) => {
              if (!open) {
                setRequestPrinting(null);
              }
            }}
            printing={requestPrinting}
            availableHint={
              requestPrinting ? (entriesByPrintingId.get(requestPrinting.id)?.length ?? 1) : 1
            }
            groupSlug={trade.groupSlug}
            groupName={trade.groupName}
            counterpartyUserId={trade.counterpartyUserId}
            counterpartyName={trade.counterpartyName}
          />
        ) : null}
      </CardBrowserFilterProvider>
    </FilterSearchProvider>
  );
}

// Per-cell "Want" pill rendered above a tradelist card; opens the request flow.
// Disabled (greyed, non-interactive) when the copy is reserved by a live trade —
// it can't be requested, and the card carries a "Reserved" badge instead.
function WantStrip({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    // h-5 + mb-1 = 24px, matching ADD_STRIP_HEIGHT so the virtualizer estimate holds.
    <div className="relative z-30 mb-1 flex h-5 items-center justify-center">
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={disabled ? "Reserved — already in a trade" : "Request this card"}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) {
            return;
          }
          onClick();
        }}
        className={cn(
          COUNT_PILL_BASE,
          disabled ? "cursor-not-allowed opacity-50" : COUNT_PILL_INTERACTIVE,
        )}
      >
        <HeartIcon className="size-3" />
        <span>Want</span>
      </button>
    </div>
  );
}

/**
 * Table-row request action for a member's tradelist. `printing` and `itemId`
 * are injected by the table via cloneElement; absent on header/placeholder
 * rows. A copy reserved by a live trade shows a "Reserved" badge in place of
 * the request button, since it can't be requested again.
 * @returns The request button, a Reserved badge, or null when no printing is bound.
 */
function TradelistRequestActionsCell({
  printing,
  itemId,
  entryByItemId,
  onRequest,
}: {
  printing?: Printing;
  itemId?: string;
  entryByItemId: Map<string, ListEntryDetailResponse>;
  onRequest: (printing: Printing) => void;
}) {
  if (!printing) {
    return null;
  }
  const entry = itemId ? entryByItemId.get(itemId) : undefined;
  if (entry?.kind === "copy" && entry.reserved) {
    return <Badge variant="success">Reserved</Badge>;
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => onRequest(printing)}>
      Want
    </Button>
  );
}

/** @returns Empty-state title text appropriate for a read-only viewer. */
function emptyTitleFor(kind: ListKind): string {
  if (kind === "copy") {
    return "No copies on this list yet";
  }
  if (kind === "printing") {
    return "No printings on this list yet";
  }
  return "No cards on this list yet";
}

/** @returns The view mode that matches a list's kind. */
function kindToView(kind: ListKind): "cards" | "printings" | "copies" {
  if (kind === "card") {
    return "cards";
  }
  if (kind === "printing") {
    return "printings";
  }
  return "copies";
}

/**
 * Restricts a catalog `printingsByCardId` map to the user's preferred
 * languages. Empty prefs means show all.
 *
 * @returns A filtered map; cards with no printing in any preferred language
 * are dropped.
 */
function filterPrintingsByLanguages(
  source: ReadonlyMap<string, Printing[]>,
  userLanguages: readonly string[],
): Map<string, Printing[]> {
  if (userLanguages.length === 0) {
    return new Map(source);
  }
  const allowed = new Set(userLanguages);
  const result = new Map<string, Printing[]>();
  for (const [cardId, printings] of source) {
    const filtered = printings.filter((printing) => allowed.has(printing.language));
    if (filtered.length > 0) {
      result.set(cardId, filtered);
    }
  }
  return result;
}

/**
 * Resolves list entries to a deduped array of Printings + a per-printing
 * entries map. Copies view expands one tile per entry; cards/printings views
 * collapse to one tile per printing.
 *
 * @returns The deduped Printing[] and entries-by-printing-id map.
 */
function collectListPrintings(
  entries: readonly ListEntryDetailResponse[],
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): {
  listPrintings: Printing[];
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>;
} {
  const listPrintings: Printing[] = [];
  const entriesByPrintingId = new Map<string, ListEntryDetailResponse[]>();
  for (const entry of entries) {
    const printing = resolveEntryPrinting(entry, printingsById, printingsByCardId);
    if (!printing) {
      continue;
    }
    const existing = entriesByPrintingId.get(printing.id);
    if (existing) {
      existing.push(entry);
      continue;
    }
    listPrintings.push(printing);
    entriesByPrintingId.set(printing.id, [entry]);
  }
  return { listPrintings, entriesByPrintingId };
}

/**
 * Picks the printing to render for an entry. Mirrors the authenticated
 * list-page resolver.
 *
 * @returns The Printing or undefined when nothing resolves.
 */
function resolveEntryPrinting(
  entry: ListEntryDetailResponse,
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): Printing | undefined {
  switch (entry.kind) {
    case "printing":
    case "copy": {
      return printingsById[entry.printingId];
    }
    case "card": {
      return printingsByCardId.get(entry.cardId)?.[0];
    }
  }
}
