import type {
  ListEntryDetailResponse,
  ListKind,
  Printing,
  PublicListDetailResponse,
} from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { HandshakeIcon, HeartIcon, ListIcon, XIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardStrip } from "@/components/cards/card-strip";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
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
import { listKindIcon } from "@/components/list/create-list-dialog";
import { collectListPrintings, kindToView } from "@/components/list/list-entries";
import { ListHeader } from "@/components/list/list-header";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountPill, CountPillButton } from "@/components/ui/count-pill";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCancelTrade, useSetTradeQuantity, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useCopies } from "@/hooks/use-copies";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
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

// Stable empty so the non-request path doesn't allocate a fresh map each render.
const EMPTY_PENDING_REQUESTS: ReadonlyMap<string, PendingRequest> = new Map();

// Public visitor has no owned-count context, and custom tags are private to
// their owner. Markers and channels stay visible (matching the public
// collection share); both self-hide when no listed printing carries one.
const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);

/**
 * The friend-group exchange surfaced on a member's shared list: a "Want" request
 * on a member's tradelist (`request`), or an "Offer" on a member's wishlist
 * (`offer`). Both contexts carry the same fields; `mode` selects the direction.
 */
export type ListExchangeContext =
  | ({ mode: "request" } & TradelistRequestContext)
  | ({ mode: "offer" } & OfferToWishlistContext);

interface SharedListContentProps {
  data: PublicListDetailResponse;
  /** Back arrow rendered as the first slot inside the list header. */
  backLink?: React.ReactNode;
  /**
   * Enables the per-card friend-group exchange (Want on a tradelist, Offer on a
   * wishlist). Passed only by the friend-group shared-list route, and only for a
   * list viewed by someone other than its owner — never on the public share
   * route.
   */
  exchange?: ListExchangeContext;
}

/**
 * Public list browser: header + virtualised card grid. Shared between the
 * per-list public share route, the user-bundle nested list route, and the
 * friend-group shared-list route.
 *
 * @returns The full page body.
 */
export function SharedListContent({ data, backLink, exchange }: SharedListContentProps) {
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
  // The top bar renders before hydration (so crawlers see the name + owner).
  // The grid depends on the global catalog (useCards) plus client-only
  // display + filter state, so defer that subtree.
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
  // The printing whose "I want this" dialog is open (request surfaces only).
  const [requestPrinting, setRequestPrinting] = useState<Printing | null>(null);
  // The open "Offer" dialog target: the printings of the wanted card the viewer
  // owns, plus how many the member wants (offer surfaces only).
  const [offerTarget, setOfferTarget] = useState<{
    choices: OfferablePrintingChoice[];
    wantQuantity: number;
  } | null>(null);

  // Offer needs the viewer's own copies to know what they can give. The whole
  // grid is client-only (gated above), so the SSR-unsafe live query is safe.
  const { data: ownedCopies } = useCopies();
  const copyIdsByPrinting =
    exchange?.mode === "offer"
      ? personalCopyIdsByPrinting(ownedCopies)
      : new Map<string, string[]>();
  // The printings (with backing copy ids) the viewer can offer against a wanted
  // entry: the exact printing for a printing-kind wishlist, any printing of the
  // card for a card-kind one, narrowed to what the viewer personally owns.
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

  // The viewer's pending "Want" request for each printing (trade id + claimed
  // quantity), against this member in this group. Drives per-copy claim/release
  // and marks exactly the claimed copies as requested. The query is polled and
  // invalidated on every claim/release, so the markers track the live state.
  const { data: userTrades } = useUserTrades();
  const pendingByPrinting =
    exchange?.mode === "request" && userTrades
      ? pendingRequestsByPrinting(userTrades.items, exchange.groupSlug, exchange.counterpartyUserId)
      : EMPTY_PENDING_REQUESTS;

  // The viewer's wish-list membership, to flag cards they already want on a
  // member's tradelist (a red heart in the strip, mirroring the group bulk box).
  // Only fetched in request mode; safe (empty) for logged-out public viewers.
  const wish = useWishEntries(exchange?.mode === "request");

  // Claim/release resize the single live trade per printing rather than opening a
  // second one (forbidden by the backend's unique-live-trade index): claiming the
  // first copy opens the request dialog (to pick + share a wishlist), every later
  // claim just bumps the quantity, and releasing decrements or cancels at zero.
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't claim that copy");
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
    // Releasing the last claimed copy cancels the request; otherwise it just
    // shrinks the quantity by one. Built outside the try so the React Compiler
    // doesn't bail (it can't handle a conditional value inside try/catch).
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't release that copy");
    }
  };

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

  // On a member's tradelist, surface how many of each printing the viewer
  // already owns next to the "Want" button, so they don't request duplicates
  // they don't need. Only the request surface shows this; the live query is
  // safe because the whole grid is client-only (gated above).
  const { data: ownedCounts } = useOwnedCountsForPrintings(
    listPrintings.map((printing) => printing.id),
    exchange?.mode === "request",
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
  // The specific copy tiles to mark as "Requested": for each printing, the first
  // N non-reserved copies, where N is the viewer's pending requested quantity.
  // Marking individual copies (rather than the whole printing) leaves the rest of
  // a multi-copy entry requestable. Reserved copies are skipped — they carry the
  // "Reserved" marker already. Only relevant for the copy-kind tradelist view.
  const requestedItemIds = new Set<string>();
  if (view === "copies") {
    for (const sortedPrinting of sortedCards) {
      let remainingRequested = pendingByPrinting.get(sortedPrinting.id)?.quantity ?? 0;
      for (const entry of entriesByPrintingId.get(sortedPrinting.id) ?? []) {
        // One tile = one copy. Rule-derived copy entries (ADR-034) have no entry
        // id, so key the tile on the copyId instead.
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
    // A copy pinned to a live (accepted) trade — yours or another member's — can't
    // be claimed; it carries the "Reserved" badge and no action.
    const reserved = entry?.kind === "copy" && entry.reserved;
    // This specific copy is covered by one of the viewer's pending requests to
    // this member. It shows a "Requested" badge (click to release) and no claim
    // button. Reserved copies are never in this set, so the markers don't overlap.
    const alreadyRequested = exchange?.mode === "request" && requestedItemIds.has(item.id);
    // Strip = the per-card action. On a tradelist (request mode), only a claimable
    // copy gets a "Claim" button — requested copies show no button (release is on
    // the badge), and reserved copies show none. On a wishlist it's "Offer";
    // otherwise the read-only quantity pill. Tradelists are copy-kind, so the
    // action never collides with the quantity pill.
    let strip: React.ReactNode;
    if (exchange?.mode === "request") {
      // Mirror the catalog: the owned-count pill opens the "in your collections"
      // breakdown. Shown on every tradelist copy that the viewer owns, regardless
      // of claim state.
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
      // A red heart when the viewer already wishes for this card, mirroring the
      // group bulk box; click opens a popover listing every wishlist it's on.
      // This is the cue that explains the request dialog: a wished card already
      // matches a shared wishlist, so its first request skips the list picker.
      const wishEntries = wish.entriesForPrinting(item.printing.cardId, item.printing.id);
      const wishSlot = wishEntries.length > 0 ? <WishlistHeart entries={wishEntries} /> : undefined;
      // The action and the status both live in this one strip row (right-aligned),
      // so every tradelist copy keeps the same height: a claimable copy shows
      // "Request", a requested copy shows "Requested ×" (click to release), and a
      // reserved copy shows "Reserved". The owned-count and wish-heart pills sit
      // left.
      strip = (
        <RequestStrip
          state={reserved ? "reserved" : alreadyRequested ? "requested" : "claimable"}
          ownedSlot={ownedSlot}
          wishSlot={wishSlot}
          disabled={tradeMutating}
          onRequest={() => handleClaim(item.printing)}
          onRelease={() => handleRelease(item.printing)}
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

  // The detail-pane picker lists every printing of the clicked card from the
  // global catalog, scoped to the user's preferred languages — not just the
  // printings on the list. The grid tiles keep their per-kind scoping; only
  // the pane fans out.
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
                      onRequest={handleClaim}
                      onRelease={handleRelease}
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
          {isMobile && (
            <SelectionMobileOverlay
              items={items}
              printingsByCardId={detailPanePrintingsByCardId}
              showImages={showImages}
              onSearchAndClose={handleSearchAndClose}
            />
          )}
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

// Per-cell strip rendered above every copy on a member's tradelist. The status
// and the action share one right-aligned slot so the row height never changes as
// a copy moves between states: a claimable copy shows a "Request" button (first
// request opens the dialog to pick + share a wishlist, later requests bump the
// live request's quantity), a requested copy shows a "Requested ×" button that
// releases one copy (decrement, or cancel at the last), and a reserved copy shows
// a read-only "Reserved" badge. The owned-count and wish-heart pills, when
// present, sit at the left. `disabled` guards against a request/release already
// in flight.
function RequestStrip({
  state,
  ownedSlot,
  wishSlot,
  disabled,
  onRequest,
  onRelease,
}: {
  state: "claimable" | "requested" | "reserved";
  /** Owned-count pill (collections popover), left-aligned. Omitted when the viewer owns none. */
  ownedSlot?: React.ReactNode;
  /** Wishlist heart pill, left-aligned next to the owned count. Omitted when not wished. */
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
        /* All three states share the count-pill shape so they read as one
           control across cards; color carries the state (neutral = actionable,
           primary tint = requested by you, green = reserved/locked). */
        state === "reserved" ? (
          <CountPill variant="success">Reserved</CountPill>
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

// Per-cell "Offer" pill rendered above a wishlist card; opens the offer flow.
// Disabled when the viewer owns no copies of the card — you can only offer what
// you have.
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

/**
 * Table-row request action for a member's tradelist. `printing` and `itemId` are
 * injected by the table via cloneElement; absent on header/placeholder rows. A
 * copy in one of the viewer's pending requests shows a "Requested" chip with a
 * release (×) button; a reserved copy shows a read-only "Reserved" badge; a
 * claimable copy shows the "Request" button.
 * @returns The request button, a release control, a Reserved badge, or null when no printing is bound.
 */
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
    return <Badge variant="success">Reserved</Badge>;
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

/**
 * Table-row offer action for a member's wishlist. `printing` and `itemId` are
 * injected by the table via cloneElement; absent on the header/placeholder rows.
 * Disabled when the viewer owns no copies to offer.
 * @returns The offer button, or null when no printing is bound.
 */
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
