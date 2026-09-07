import type {
  ListEntryDetailResponse,
  ListKind,
  PublicListDetailResponse,
} from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { HandshakeIcon, HeartIcon, ListIcon, XIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import { CardStrip } from "@/components/cards/card-strip";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import { WishlistHeart } from "@/components/cards/wishlist-heart";
import { OfferToWishlistDialog } from "@/components/friend-groups/offer-to-wishlist-dialog";
import type {
  OfferablePrintingChoice,
  OfferToWishlistContext,
} from "@/components/friend-groups/offer-to-wishlist-dialog";
import { RequestFromTradelistDialog } from "@/components/friend-groups/request-from-tradelist-dialog";
import type { TradelistRequestContext } from "@/components/friend-groups/request-from-tradelist-dialog";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { LIST_KIND_ICON } from "@/components/list/create-list-dialog";
import { ListHeader } from "@/components/list/list-header";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SharedTradeStatusChip } from "@/components/trades/trade-status-chip";
import { Button } from "@/components/ui/button";
import { CountPillButton } from "@/components/ui/count-pill";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useCancelTrade, useSetTradeQuantity, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useCopies } from "@/hooks/use-copies";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { ADD_STRIP_HEIGHT } from "@/lib/card-grid-constants";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { collectListPrintings, kindToView } from "@/lib/list-entries";
import { FilterSearchProvider, useFilterSearch } from "@/lib/search-schemas";
import {
  offerablePrintings,
  pendingRequestsByPrinting,
  personalCopyIdsByPrinting,
} from "@/lib/tradelist-exchange";
import type { PendingRequest } from "@/lib/tradelist-exchange";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

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

const EMPTY_PENDING_REQUESTS: ReadonlyMap<string, PendingRequest> = new Map();

const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);

/** A "Want" request on a member's tradelist, or an "Offer" on a member's wishlist. */
export type ListExchangeContext =
  | ({ mode: "request" } & TradelistRequestContext)
  | ({ mode: "offer" } & OfferToWishlistContext);

interface SharedListContentProps {
  data: PublicListDetailResponse;
  backLink?: React.ReactNode;
  notice?: React.ReactNode;
  exchange?: ListExchangeContext;
}

/**
 * Public list browser: header + virtualised card grid. Shared between the
 * per-list public share route, the user-bundle nested list route, and the
 * friend-group shared-list route.
 */
export function SharedListContent({ data, backLink, exchange, notice }: SharedListContentProps) {
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
          {notice}
          <SharedListBody data={data} exchange={exchange} />
        </div>
      </div>
    </PageTopBarHeightContext>
  );
}

function SharedListBody({
  data,
  exchange,
}: {
  data: PublicListDetailResponse;
  exchange?: ListExchangeContext;
}) {
  const hydrated = useHydrated();
  // Top bar renders before hydration so crawlers see the name + owner; the grid
  // needs client-only catalog and filter state, so it's deferred.
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground py-3 text-sm">Loading cards…</p>}>
      <SharedListGrid data={data} exchange={exchange} />
    </Suspense>
  );
}

function SharedListGrid({
  data,
  exchange,
}: {
  data: PublicListDetailResponse;
  exchange?: ListExchangeContext;
}) {
  const { entries, list } = data;
  const { printingsById, printingsByCardId, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  const [requestPrinting, setRequestPrinting] = useState<Printing | null>(null);
  const [offerTarget, setOfferTarget] = useState<{
    choices: OfferablePrintingChoice[];
    wantQuantity: number;
  } | null>(null);

  // Renders only when SharedListBody has gated this client-only; the query is SSR-unsafe otherwise.
  const { data: ownedCopies } = useCopies();
  const copyIdsByPrinting =
    exchange?.mode === "offer"
      ? personalCopyIdsByPrinting(ownedCopies)
      : new Map<string, string[]>();
  const offerChoicesForPrinting = (printing: Printing): OfferablePrintingChoice[] => {
    const candidatePrintingIds =
      list.kind === "printing"
        ? [printing.id]
        : (printingsByCardId.get(printing.cardId) ?? []).map((candidate) => candidate.id);
    return offerablePrintings(candidatePrintingIds, copyIdsByPrinting).map((entry) => ({
      printing: printingsById[entry.printingId] ?? printing,
      copyIds: entry.copyIds,
    }));
  };

  // Polled and invalidated on every claim/release, so the markers track live state.
  const { data: userTrades } = useUserTrades();
  const pendingByPrinting =
    exchange?.mode === "request" && userTrades
      ? pendingRequestsByPrinting(userTrades.items, exchange.groupSlug, exchange.counterpartyUserId)
      : EMPTY_PENDING_REQUESTS;

  // Only fetched in request mode; empty for logged-out visitors.
  const wish = useWishEntries(exchange?.mode === "request");

  // Claim/release resize the single live trade per printing; the backend's
  // unique-live-trade index forbids opening a second one.
  const setTradeQuantity = useSetTradeQuantity();
  const cancelTrade = useCancelTrade();
  const tradeMutating = setTradeQuantity.isPending || cancelTrade.isPending;

  const handleClaim = async (printing: Printing) => {
    if (exchange?.mode !== "request") {
      return;
    }
    const pending = pendingByPrinting.get(printing.id);
    if (pending === undefined) {
      setRequestPrinting(printing);
      return;
    }
    try {
      await setTradeQuantity.mutateAsync({
        tradeId: pending.tradeId,
        quantity: pending.quantity + 1,
        groupSlug: exchange.groupSlug,
      });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  };

  const handleRelease = async (printing: Printing) => {
    if (exchange?.mode !== "request") {
      return;
    }
    const pending = pendingByPrinting.get(printing.id);
    if (pending === undefined) {
      return;
    }
    // Built outside the try: the React Compiler can't handle a conditional value inside try/catch.
    const release =
      pending.quantity > 1
        ? setTradeQuantity.mutateAsync({
            tradeId: pending.tradeId,
            quantity: pending.quantity - 1,
            groupSlug: exchange.groupSlug,
          })
        : cancelTrade.mutateAsync({ tradeId: pending.tradeId, groupSlug: exchange.groupSlug });
    try {
      await release;
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  };

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const filterSearch = useFilterSearch();
  const view: "cards" | "printings" | "copies" = kindToView(list.kind);
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  const { data: ownedCounts } = useOwnedCountsForPrintings(
    listPrintings.map((printing) => printing.id),
    exchange?.mode === "request",
  );

  // Empty language prefs means show all.
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
  // Marks individual copy tiles, not whole printings, so unrequested copies of a
  // multi-copy entry stay requestable. Reserved copies are skipped (already
  // marked "Reserved").
  const requestedItemIds = new Set<string>();
  if (view === "copies") {
    for (const sortedPrinting of sortedCards) {
      let remainingRequested = pendingByPrinting.get(sortedPrinting.id)?.quantity ?? 0;
      for (const entry of entriesByPrintingId.get(sortedPrinting.id) ?? []) {
        // Rule-derived copy entries have no entry id; fall back to copyId for the tile key.
        const itemId = entry.id ?? (entry.kind === "copy" ? entry.copyId : sortedPrinting.id);
        items.push({ id: itemId, printing: sortedPrinting });
        entryByItemId.set(itemId, entry);
        const reserved = entry.kind === "copy" && entry.reserved;
        if (remainingRequested > 0 && !reserved) {
          requestedItemIds.add(itemId);
          remainingRequested -= 1;
        }
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
    const siblings =
      view === "cards"
        ? (list.kind === "card" ? userScopedPrintingsByCardId : filteredPrintingsByCardId).get(
            cardId,
          )
        : undefined;
    const entry = entryByItemId.get(item.id);
    const reserved = entry?.kind === "copy" && entry.reserved;
    // Reserved copies are never in requestedItemIds, so these two never overlap.
    const alreadyRequested = exchange?.mode === "request" && requestedItemIds.has(item.id);
    let strip: React.ReactNode;
    if (exchange?.mode === "request") {
      const ownedCount = ownedCounts?.totals[item.printing.id] ?? 0;
      const ownedSlot =
        ownedCount > 0 ? (
          <OwnedCollectionsPopover
            printingId={item.printing.id}
            cardName={legendDisplayName(item.printing.card)}
            shortCode={item.printing.shortCode}
            count={ownedCount}
            align="start"
          />
        ) : undefined;
      const wishEntries = wish.entriesForPrinting(item.printing.cardId, item.printing.id);
      const wishSlot = wishEntries.length > 0 ? <WishlistHeart entries={wishEntries} /> : undefined;
      strip = (
        <RequestStrip
          state={reserved ? "reserved" : alreadyRequested ? "requested" : "claimable"}
          ownedSlot={ownedSlot}
          wishSlot={wishSlot}
          disabled={tradeMutating}
          onRequest={() => void handleClaim(item.printing)}
          onRelease={() => void handleRelease(item.printing)}
        />
      );
    } else if (exchange?.mode === "offer") {
      const choices = offerChoicesForPrinting(item.printing);
      strip = (
        <OfferStrip
          disabled={choices.length === 0}
          onClick={() => setOfferTarget({ choices, wantQuantity: entry?.quantity ?? 1 })}
        />
      );
    } else if (entry && list.kind !== "copy") {
      strip = <CardCountStrip count={entry.quantity} icon={ListIcon} />;
    } else {
      strip = undefined;
    }

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

  const detailPanePrintingsByCardId = userScopedPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (listPrintings.length === 0) {
    const KindIcon = LIST_KIND_ICON[list.kind];
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

  // Without this override, filterSearch.view falls back to the URL/default
  // ("cards") on printing- and copy-kind lists.
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
          rightPane={rightPane}
          addStripHeight={ADD_STRIP_HEIGHT}
          table={
            exchange?.mode === "request"
              ? {
                  actionsColumn: "narrow",
                  actionsLabel: "Trade",
                  actionsCell: (
                    <TradelistRequestActionsCell
                      entryByItemId={entryByItemId}
                      requestedItemIds={requestedItemIds}
                      disabled={tradeMutating}
                      onRequest={(printing) => void handleClaim(printing)}
                      onRelease={(printing) => void handleRelease(printing)}
                    />
                  ),
                }
              : exchange?.mode === "offer"
                ? {
                    actionsColumn: "narrow",
                    actionsLabel: "Offer",
                    actionsCell: (
                      <OfferActionsCell
                        entryByItemId={entryByItemId}
                        offerChoicesForPrinting={offerChoicesForPrinting}
                        onOffer={(choices, wantQuantity) =>
                          setOfferTarget({ choices, wantQuantity })
                        }
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
          <SelectionDetailOverlays
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
          />
        </CardViewer>
        {exchange?.mode === "request" ? (
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
            groupSlug={exchange.groupSlug}
            groupName={exchange.groupName}
            counterpartyUserId={exchange.counterpartyUserId}
            counterpartyName={exchange.counterpartyName}
          />
        ) : null}
        {exchange?.mode === "offer" ? (
          <OfferToWishlistDialog
            open={offerTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setOfferTarget(null);
              }
            }}
            choices={offerTarget?.choices ?? []}
            wantQuantity={offerTarget?.wantQuantity ?? 1}
            groupSlug={exchange.groupSlug}
            groupName={exchange.groupName}
            counterpartyUserId={exchange.counterpartyUserId}
            counterpartyName={exchange.counterpartyName}
          />
        ) : null}
      </CardBrowserFilterProvider>
    </FilterSearchProvider>
  );
}

function RequestStrip({
  state,
  ownedSlot,
  wishSlot,
  disabled,
  onRequest,
  onRelease,
}: {
  state: "claimable" | "requested" | "reserved";
  ownedSlot?: React.ReactNode;
  wishSlot?: React.ReactNode;
  disabled?: boolean;
  onRequest: () => void;
  onRelease: () => void;
}) {
  return (
    <CardStrip
      left={
        (ownedSlot || wishSlot) && (
          <>
            {ownedSlot}
            {wishSlot}
          </>
        )
      }
      right={
        // Share-token access has no session: the reserved chip must never name who the copy is promised to.
        state === "reserved" ? (
          <SharedTradeStatusChip />
        ) : state === "requested" ? (
          <CountPillButton
            variant="primary"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Cancel this copy"
            title="Click to cancel this copy"
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled) {
                onRelease();
              }
            }}
          >
            <span>Requested</span>
            <XIcon className="size-3" />
          </CountPillButton>
        ) : (
          <CountPillButton
            tabIndex={-1}
            disabled={disabled}
            aria-label="Request this copy"
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled) {
                onRequest();
              }
            }}
          >
            <HeartIcon className="size-3" />
            <span>Request</span>
          </CountPillButton>
        )
      }
    />
  );
}

function OfferStrip({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <CardStrip
      center={
        <CountPillButton
          tabIndex={-1}
          aria-label={disabled ? "You don't own this card" : "Offer this card"}
          title={disabled ? "You don't own this card" : undefined}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) {
              onClick();
            }
          }}
        >
          <HandshakeIcon className="size-3" />
          <span>Offer</span>
        </CountPillButton>
      }
    />
  );
}

/** `printing` and `itemId` are injected by the table via cloneElement; absent on header/placeholder rows. */
function TradelistRequestActionsCell({
  printing,
  itemId,
  entryByItemId,
  requestedItemIds,
  disabled,
  onRequest,
  onRelease,
}: {
  printing?: Printing;
  itemId?: string;
  entryByItemId: Map<string, ListEntryDetailResponse>;
  requestedItemIds: ReadonlySet<string>;
  disabled?: boolean;
  onRequest: (printing: Printing) => void;
  onRelease: (printing: Printing) => void;
}) {
  if (!printing) {
    return null;
  }
  if (itemId && requestedItemIds.has(itemId)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label="Cancel this copy"
        onClick={() => onRelease(printing)}
      >
        Requested
        <XIcon className="size-3" />
      </Button>
    );
  }
  const entry = itemId ? entryByItemId.get(itemId) : undefined;
  if (entry?.kind === "copy" && entry.reserved) {
    return <SharedTradeStatusChip />;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => onRequest(printing)}
    >
      Request
    </Button>
  );
}

/** `printing` and `itemId` are injected by the table via cloneElement; absent on header/placeholder rows. */
function OfferActionsCell({
  printing,
  itemId,
  entryByItemId,
  offerChoicesForPrinting,
  onOffer,
}: {
  printing?: Printing;
  itemId?: string;
  entryByItemId: Map<string, ListEntryDetailResponse>;
  offerChoicesForPrinting: (printing: Printing) => OfferablePrintingChoice[];
  onOffer: (choices: OfferablePrintingChoice[], wantQuantity: number) => void;
}) {
  if (!printing) {
    return null;
  }
  const choices = offerChoicesForPrinting(printing);
  const wantQuantity = (itemId ? entryByItemId.get(itemId)?.quantity : undefined) ?? 1;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={choices.length === 0}
      title={choices.length === 0 ? "You don't own this card" : undefined}
      onClick={() => onOffer(choices, wantQuantity)}
    >
      Offer
    </Button>
  );
}

function emptyTitleFor(kind: ListKind): string {
  if (kind === "copy") {
    return "No copies on this list yet";
  }
  if (kind === "printing") {
    return "No printings on this list yet";
  }
  return "No cards on this list yet";
}
