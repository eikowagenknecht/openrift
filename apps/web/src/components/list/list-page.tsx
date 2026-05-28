import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  Printing,
  TradePreference,
} from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  ListIcon,
  ListPlusIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { use, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

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
import type { TableRowSlotProps } from "@/components/cards/card-table";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import type { ListEntryDragData } from "@/components/collection/dnd-types";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { DeleteListDialog } from "@/components/list/delete-list-dialog";
import { DraggableListEntry } from "@/components/list/draggable-list-entry";
import { ListEditDialog } from "@/components/list/list-edit-dialog";
import { ListEntryContextMenu } from "@/components/list/list-entry-context-menu";
import { ListEntryTableActions } from "@/components/list/list-entry-table-actions";
import { ListExportDialog } from "@/components/list/list-export-dialog";
import { ListHeader } from "@/components/list/list-header";
import { ListImportDialog } from "@/components/list/list-import-dialog";
import { ListShareDialog } from "@/components/list/list-share-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { TradePreferenceDialog } from "@/components/trade-preferences/trade-preference-dialog";
import { TradePreferenceGridPill } from "@/components/trade-preferences/trade-preference-grid-pill";
import { TradePreferencePill } from "@/components/trade-preferences/trade-preference-pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useSidebar } from "@/components/ui/sidebar";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import {
  useBulkAddListEntries,
  useDeleteList,
  useListDetail,
  useRemoveListEntry,
  useUpdateList,
  useUpdateListEntry,
} from "@/hooks/use-lists";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface ListPageProps {
  listId: string;
}

/**
 * Empty-state copy by kind. The "how to add" guidance is kind-specific —
 * copy-kind lists are filled from the collection grid's float-bar or by
 * dragging copies onto the list in the sidebar. Card and printing kinds can
 * also be filled by browsing the full catalog directly from this page (the
 * "Browse catalog" CTA), which flips the grid into add mode.
 * @returns The title/description for the empty state.
 */
function emptyStateCopy(kind: ListKind): { title: string; description: string } {
  if (kind === "copy") {
    return {
      title: "No copies on this list yet",
      description:
        "Open a collection, select copies, and use the “Add to list” action to put them here.",
    };
  }
  if (kind === "printing") {
    return {
      title: "No printings on this list yet",
      description: "Browse the catalog to add printings, or drag copies onto the list.",
    };
  }
  return {
    title: "No cards on this list yet",
    description: "Browse the catalog to add cards, or drag copies onto the list.",
  };
}

// Browse mode: lists carry their own per-entry data, so the catalog-wide
// owned/markers/channels/customTags filter sections aren't meaningful. They're
// re-enabled in add mode (where the grid IS the catalog) — see the
// `hiddenSections` branch in ListEntryBrowser.
const LIST_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "markers",
  "channels",
  "customTags",
]);

export function ListPage({ listId }: ListPageProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data } = useListDetail(listId);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const deleteList = useDeleteList();
  const removeEntry = useRemoveListEntry();
  const updateEntry = useUpdateListEntry();
  const updateList = useUpdateList();

  const KindIcon = listKindIcon(data.list.kind);
  const empty = emptyStateCopy(data.list.kind);

  // Catalog add mode is a global display-store flag shared with /cards and
  // /collections. Copy-kind lists don't expose add mode (a "copy" only exists
  // inside a collection; the float-bar / sidebar DnD are the canonical paths).
  const catalogMode = useDisplayStore((state) => state.catalogMode);
  const isAddMode = catalogMode === "add" && data.list.kind !== "copy";

  // Switching lists flips catalogMode back to off so the user doesn't land
  // in add mode on the new list by surprise. Mirrors the same reset the
  // collection grid does on collectionId change.
  useEffect(() => {
    if (useDisplayStore.getState().catalogMode === "add") {
      useDisplayStore.getState().toggleCatalogModeAdd();
    }
  }, [listId]);

  const handleDelete = () => {
    deleteList.mutate(listId, {
      onSuccess: () => {
        setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const handleRemoveEntry = (entryId: string, cardName: string) => {
    removeEntry.mutate(
      { listId, entryId },
      {
        onSuccess: () => toast.success(`Removed ${cardName} from list`),
      },
    );
  };

  const handleQuantityChange = (entryId: string, quantity: number) => {
    updateEntry.mutate({ listId, entryId, quantity });
  };

  const handleTradeOverrideChange = (
    entryId: string,
    tradeOverride: TradePreference,
    listCurrencyToSet?: Currency,
  ) => {
    // The dialog asks the user for a currency when the list doesn't have one
    // yet and they pick an absolute price. Patch the list first so the entry
    // update applies against a list that already has a currency, and so the
    // user doesn't have to open Edit list separately afterwards.
    if (listCurrencyToSet) {
      updateList.mutate({ listId, currency: listCurrencyToSet });
    }
    updateEntry.mutate({ listId, entryId, tradeOverride });
  };

  const entriesCount = data.entries.length;

  const topBar = (
    <ListHeader
      list={data.list}
      entries={data.entries}
      attribution={{ kind: "shares" }}
      onToggleSidebar={toggleSidebar}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            <EllipsisVerticalIcon className="size-4" />
            <span className="sr-only">List actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <PencilIcon className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              {data.list.shareToken === null ? "Share" : "Manage sharing"}
            </DropdownMenuItem>
            {data.list.kind === "card" && (
              <>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <UploadIcon className="size-4" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setExportOpen(true)}>
                  <DownloadIcon className="size-4" />
                  Export
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );

  const topBarPortal = topBarSlot && createPortal(topBar, topBarSlot);

  const editDialog = (
    <ListEditDialog
      listId={listId}
      intent={data.list.intent}
      currentName={data.list.name}
      currentTradeDefaults={data.list.tradeDefaults}
      currentCurrency={data.list.currency}
      open={editOpen}
      onOpenChange={setEditOpen}
    />
  );

  const deleteDialog = (
    <DeleteListDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      listName={data.list.name}
      kind={data.list.kind}
      entryCount={entriesCount}
      onConfirm={handleDelete}
      isPending={deleteList.isPending}
    />
  );

  const shareDialog = (
    <ListShareDialog
      listId={listId}
      shareToken={data.list.shareToken}
      open={shareOpen}
      onOpenChange={setShareOpen}
    />
  );

  const exportDialog = data.list.kind === "card" && (
    <ListExportDialog entries={data.entries} open={exportOpen} onOpenChange={setExportOpen} />
  );

  const importDialog = data.list.kind === "card" && (
    <ListImportDialog listId={listId} open={importOpen} onOpenChange={setImportOpen} />
  );

  // When add mode is active we fall through to the browser even with zero
  // entries — the grid renders the whole catalog so the user can start adding.
  if (entriesCount === 0 && !isAddMode) {
    const canEnterAddMode = data.list.kind !== "copy";
    return (
      <>
        {topBarPortal}
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia>
              <KindIcon className="size-16 opacity-50" />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canEnterAddMode && (
              <Button onClick={() => useDisplayStore.getState().toggleCatalogModeAdd()}>
                <ListPlusIcon className="size-4" />
                Browse catalog
              </Button>
            )}
          </EmptyContent>
        </Empty>
        {editDialog}
        {deleteDialog}
        {shareDialog}
        {exportDialog}
        {importDialog}
      </>
    );
  }

  return (
    <>
      {topBarPortal}
      <ListEntryBrowser
        listId={listId}
        kind={data.list.kind}
        intent={data.list.intent}
        listTradeDefaults={data.list.tradeDefaults}
        listCurrency={data.list.currency}
        entries={data.entries}
        onRemoveEntry={handleRemoveEntry}
        onQuantityChange={handleQuantityChange}
        onTradeOverrideChange={handleTradeOverrideChange}
        isRemovePendingFor={(entryId) =>
          removeEntry.isPending && removeEntry.variables?.entryId === entryId
        }
        isQuantityPendingFor={(entryId) =>
          updateEntry.isPending && updateEntry.variables?.entryId === entryId
        }
      />
      {editDialog}
      {deleteDialog}
      {shareDialog}
      {exportDialog}
      {importDialog}
    </>
  );
}

interface ListActionsCellProps extends TableRowSlotProps {
  kind: ListKind;
  entryByItemId: Map<string, ListEntryDetailResponse>;
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>;
  supportsTradePrefs: boolean;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  onEditTradePref: (entryId: string) => void;
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
  isRemovePendingFor: (entryId: string) => boolean;
  isQuantityPendingFor: (entryId: string) => boolean;
}

function ListActionsCell({
  printing,
  itemId,
  kind,
  entryByItemId,
  entriesByPrintingId,
  supportsTradePrefs,
  listTradeDefaults,
  listCurrency,
  onEditTradePref,
  onRemoveEntry,
  onQuantityChange,
  isRemovePendingFor,
  isQuantityPendingFor,
}: ListActionsCellProps) {
  if (!printing || !itemId) {
    return null;
  }
  const entry = entryByItemId.get(itemId) ?? entriesByPrintingId.get(printing.id)?.[0];
  if (!entry) {
    return null;
  }
  const tradePill = supportsTradePrefs ? (
    <TradePreferencePill
      override={entry.tradeOverride}
      listDefault={listTradeDefaults}
      currency={listCurrency}
      isOverridden={
        entry.tradeOverride.pricePref !== null ||
        entry.tradeOverride.priceAbsoluteCents !== null ||
        entry.tradeOverride.tradeType !== null
      }
      onEdit={() => onEditTradePref(entry.id)}
    />
  ) : null;
  return (
    <div className="flex items-center gap-2">
      {tradePill}
      {kind === "copy" ? (
        <ListEntryTableActions
          showQuantity={false}
          onRemove={() => onRemoveEntry(entry.id, entry.cardName)}
          isRemovePending={isRemovePendingFor(entry.id)}
        />
      ) : (
        <ListEntryTableActions
          showQuantity
          quantity={entry.quantity}
          onIncrement={() => onQuantityChange(entry.id, entry.quantity + 1)}
          onDecrement={() => onQuantityChange(entry.id, entry.quantity - 1)}
          onRemove={() => onRemoveEntry(entry.id, entry.cardName)}
          isQuantityPending={isQuantityPendingFor(entry.id)}
          isRemovePending={isRemovePendingFor(entry.id)}
        />
      )}
    </div>
  );
}

interface ListEntryBrowserProps {
  listId: string;
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  entries: ListEntryDetailResponse[];
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
  onTradeOverrideChange: (
    entryId: string,
    next: TradePreference,
    listCurrencyToSet?: Currency,
  ) => void;
  isRemovePendingFor: (entryId: string) => boolean;
  isQuantityPendingFor: (entryId: string) => boolean;
}

/**
 * The unified card-browser scaffold rendered with list entries: same toolbar /
 * left-pane / above-grid as `/collections` and the public collection share.
 * Per-cell context menu and per-row table action both surface "Remove from
 * list" so the affordance is visible across cards/printings and table views.
 *
 * View modes:
 *   - cards view:    one tile per card (printings of the same card collapse)
 *   - printings view: one tile per printing (copies of the same printing collapse)
 *   - copies view:    one tile per individual entry (only available on
 *                     copy-kind lists where each entry IS a physical copy)
 * @returns The card browser content for an authenticated list page.
 */
function ListEntryBrowser({
  listId,
  kind,
  intent,
  listTradeDefaults,
  listCurrency,
  entries,
  onRemoveEntry,
  onQuantityChange,
  onTradeOverrideChange,
  isRemovePendingFor,
  isQuantityPendingFor,
}: ListEntryBrowserProps) {
  const supportsTradePrefs = intent !== "organize";
  // Grid-view editing uses a dialog instead of an inline popover — there's
  // no room on the cell. The dialog is mounted once and re-targets the
  // entry the user picked via the context menu.
  const [prefDialogEntryId, setPrefDialogEntryId] = useState<string | null>(null);
  const prefDialogEntry =
    prefDialogEntryId === null ? null : (entries.find((e) => e.id === prefDialogEntryId) ?? null);
  const { allPrintings, printingsById, printingsByCardId, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const catalogMode = useDisplayStore((state) => state.catalogMode);
  const isAddMode = catalogMode === "add" && kind !== "copy";

  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // List surfaces lock the view to the list's kind — a card-kind list
  // displays as cards, printing-kind as printings, copy-kind as copies.
  // The filter toolbar hides the view-mode toggle entirely on these pages
  // so there's no way to land on a mismatched view.
  const view: "cards" | "printings" | "copies" = kindToView(kind);
  // useCardData and CardCell only know "cards" | "printings". The catalog
  // pipeline still operates on printings; we expand to one-per-entry below.
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  // Resolve each entry to a printing for the catalog filter pipeline. Card-
  // targeted entries fall back to the card's first known printing. Entries we
  // can't resolve (printing missing from catalog) are dropped.
  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  // Browse-mode pipeline (scoped to entries on the list).
  const {
    sortedCards: listSortedCards,
    printingsByCardId: listPrintingsByCardId,
    priceRangeByCardId: listPriceRangeByCardId,
    availableFilters: listAvailableFilters,
    availableLanguages: listAvailableLanguages,
    filterCounts: listFilterCounts,
    setDisplayLabel: listSetDisplayLabel,
    totalUniqueCards: listTotalUniqueCards,
    filteredCount: listFilteredCount,
  } = useCardData({
    allPrintings: listPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    // Browse mode hides the catalog-wide owned/markers/channels/customTags
    // sections (see LIST_HIDDEN_FILTER_SECTIONS), so the owned-count map
    // wouldn't drive any visible UI here.
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  // Add-mode pipeline (full catalog). Computed unconditionally so toggling the
  // mode is cheap — `useCardData` is memoized by its inputs.
  const {
    sortedCards: catalogSortedCards,
    printingsByCardId: catalogPrintingsByCardId,
    priceRangeByCardId: catalogPriceRangeByCardId,
    availableFilters: catalogAvailableFilters,
    availableLanguages: catalogAvailableLanguages,
    filterCounts: catalogFilterCounts,
    setDisplayLabel: catalogSetDisplayLabel,
    totalUniqueCards: catalogTotalUniqueCards,
    filteredCount: catalogFilteredCount,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    ownedCountByPrinting,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const sortedCards = isAddMode ? catalogSortedCards : listSortedCards;
  const filteredPrintingsByCardId = isAddMode ? catalogPrintingsByCardId : listPrintingsByCardId;
  const priceRangeByCardId = isAddMode ? catalogPriceRangeByCardId : listPriceRangeByCardId;
  const availableFilters = isAddMode ? catalogAvailableFilters : listAvailableFilters;
  const availableLanguages = isAddMode ? catalogAvailableLanguages : listAvailableLanguages;
  const filterCounts = isAddMode ? catalogFilterCounts : listFilterCounts;
  const setDisplayLabel = isAddMode ? catalogSetDisplayLabel : listSetDisplayLabel;
  const totalUniqueCards = isAddMode ? catalogTotalUniqueCards : listTotalUniqueCards;
  const filteredCount = isAddMode ? catalogFilteredCount : listFilteredCount;

  // User-scoped fan: for card-kind lists we want the fan + detail pane to
  // show every printing of the card *from the global catalog*, but limited
  // to the user's preferred languages so the user doesn't see foreign-
  // language reprints they aren't interested in. Falls back to the full
  // catalog map when the user has no language preference set.
  const userLanguages = useDisplayStore((state) => state.languages);
  const userScopedPrintingsByCardId = filterPrintingsByLanguages(printingsByCardId, userLanguages);

  // Items + per-tile entry lookup. Copies view expands one tile per entry so
  // the user sees every physical copy separately; other views collapse to one
  // tile per printing. Add mode iterates over the catalog (one tile per
  // printing) — no per-entry expansion since most catalog tiles have no entry.
  const { items, entryByItemId } = isAddMode
    ? buildItemsFromCatalog(sortedCards)
    : buildItems(view, sortedCards, entriesByPrintingId);

  // ── Entry lookup for add-mode + quantity display ─────────────────────
  // Keyed by cardId on card-kind lists and printingId on printing-kind lists.
  // Quantity comes straight from `entry.quantity`. Mutations write to the
  // query cache optimistically (see useBulkAddListEntries / useUpdateListEntry),
  // so rapid +/- clicks reflect immediately without a separate pending store.
  const entryByKey = buildEntryByKey(kind, entries);
  const bulkAddEntries = useBulkAddListEntries();
  const updateEntryMutation = useUpdateListEntry();

  // When grouping by set in cards view, each (cardId, setId) gets its own
  // tile, so clicks need to navigate by printing rather than card — same
  // reason as CardBrowser / public collection share.
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

  const handleIncrement = (printing: Printing) => {
    // Lists upsert by (listId, cardId|printingId) — adding the same key twice
    // bumps quantity. We always send quantity: 1; the server's bulk endpoint
    // handles "new entry" vs. "+1 to existing entry" uniformly, and the hook's
    // onMutate writes the optimistic bump straight into the query cache.
    const entryShape =
      kind === "card"
        ? { cardId: printing.cardId, quantity: 1 }
        : { printingId: printing.id, quantity: 1 };
    bulkAddEntries.mutate({ listId, entries: [entryShape] });
  };

  const handleDecrement = (printing: Printing) => {
    const key = kind === "card" ? printing.cardId : printing.id;
    const entry = entryByKey.get(key);
    if (!entry || entry.quantity <= 1) {
      return;
    }
    updateEntryMutation.mutate({ listId, entryId: entry.id, quantity: entry.quantity - 1 });
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const entry = entryByItemId.get(item.id);
    const onRemove = entry
      ? () => onRemoveEntry(entry.id, entry.cardName)
      : () => {
          /* noop — browse mode resolves every item to an entry by construction */
        };
    const onSetPreference =
      entry && supportsTradePrefs ? () => setPrefDialogEntryId(entry.id) : undefined;
    // Fan-out behind the tile:
    //   - browse + card-kind: every printing of the card in the user's
    //     preferred languages (entry doesn't pin a specific printing)
    //   - browse + other kinds: only the printings already on the list
    //   - add mode + cards view: every printing of the card per catalog
    //     filters (the visible fan should match what's filtered)
    const siblings =
      view === "cards"
        ? (isAddMode
            ? filteredPrintingsByCardId
            : kind === "card"
              ? userScopedPrintingsByCardId
              : filteredPrintingsByCardId
          ).get(cardId)
        : undefined;

    if (isAddMode) {
      const key = kind === "card" ? cardId : item.printing.id;
      const displayedCount = entryByKey.get(key)?.quantity ?? 0;
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
          dimmed={displayedCount === 0}
          stripSlot="topSlot"
          strip={
            <CardCountStrip
              count={displayedCount}
              icon={ListIcon}
              decrement={{
                onClick: () => handleDecrement(item.printing),
                disabled: displayedCount <= 1,
                ariaLabel: `Decrease ${item.printing.card.name} quantity on list`,
              }}
              increment={{
                onClick: () => handleIncrement(item.printing),
                ariaLabel: `Add ${item.printing.card.name} to list`,
              }}
            />
          }
        />
      );
    }

    // Browse mode strip: quantity stepper (card/printing-kind lists only)
    // plus the trade-preference pill, both centered together between the
    // -/+ buttons. Copy-kind lists hide the stepper but still get the pill
    // alone in the same strip slot for consistency across cells.
    const tradePill =
      entry && supportsTradePrefs ? (
        <TradePreferenceGridPill
          override={entry.tradeOverride}
          listDefault={listTradeDefaults}
          currency={listCurrency}
          isOverridden={
            entry.tradeOverride.pricePref !== null ||
            entry.tradeOverride.priceAbsoluteCents !== null ||
            entry.tradeOverride.tradeType !== null
          }
          onEdit={() => setPrefDialogEntryId(entry.id)}
        />
      ) : null;

    const buildQuantityStrip = (): ReactNode => {
      if (!entry) {
        return null;
      }
      if (kind === "copy") {
        // Copy-kind: no count, no stepper. If we have a trade pill, render
        // it alone in a strip matching the count-strip height so card sizes
        // stay uniform with the other kinds.
        return tradePill ? (
          <div className="relative z-30 mb-1 flex h-5 items-center justify-center">{tradePill}</div>
        ) : null;
      }
      const isPending = isQuantityPendingFor(entry.id);
      return (
        <CardCountStrip
          count={entry.quantity}
          decrement={{
            onClick: () => onQuantityChange(entry.id, entry.quantity - 1),
            disabled: isPending || entry.quantity <= 1,
            ariaLabel: `Decrease ${entry.cardName} quantity`,
          }}
          increment={{
            onClick: () => onQuantityChange(entry.id, entry.quantity + 1),
            disabled: isPending,
            ariaLabel: `Increase ${entry.cardName} quantity`,
          }}
          extras={tradePill}
        />
      );
    };
    const quantityStrip = buildQuantityStrip();

    // Drag wiring: only browse-mode tiles with a backing entry are draggable.
    // Add-mode tiles came from the catalog, not from the list, so they have
    // nothing to move. The drag carries the single entry the tile represents
    // (see the kind/view invariants in buildItems — each tile resolves 1:1).
    const dragData: ListEntryDragData | undefined = entry
      ? {
          type: "list-entry",
          entryIds: [entry.id],
          sourceListId: listId,
          sourceKind: kind,
          sourceIntent: intent,
          totalQuantity: entry.quantity,
          printing: item.printing,
          cardName: entry.cardName,
        }
      : undefined;
    const dragId = entry ? `list-entry-${entry.id}` : undefined;

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
        strip={quantityStrip}
        contextMenu={<ListEntryContextMenu onRemove={onRemove} onSetPreference={onSetPreference} />}
        wrap={dragData && dragId ? <DraggableListEntry id={dragId} data={dragData} /> : undefined}
      />
    );
  };

  const totalDisplay = view === "copies" && !isAddMode ? items.length : totalUniqueCards;
  const filteredDisplay = view === "copies" && !isAddMode ? items.length : filteredCount;
  const totalListItems = isAddMode
    ? allPrintings.length
    : view === "copies"
      ? entries.length
      : listPrintings.length;

  const toggleAddMode = () => useDisplayStore.getState().toggleCatalogModeAdd();
  const addModeButton =
    kind === "copy" ? null : (
      <Button
        variant={isAddMode ? "default" : "outline"}
        size="icon"
        onClick={toggleAddMode}
        title={isAddMode ? "Stop browsing catalog" : "Browse catalog to add to list"}
        aria-label={isAddMode ? "Stop browsing catalog" : "Browse catalog to add to list"}
      >
        {isAddMode ? <ListPlusIcon className="size-4" /> : <ListIcon className="size-4" />}
      </Button>
    );

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
      extras={addModeButton}
    />
  );

  const leftPane = <BrowserLeftPane />;
  const aboveGrid = <BrowserActiveFilters />;

  // For card-kind lists, the entry intentionally doesn't pin a specific
  // printing — the user said "any printing of this card is fine". The detail
  // pane fans out every printing of the card from the global catalog,
  // scoped to the user's language prefs (matches the in-tile siblings fan).
  // Printing/copy kinds stay scoped to what's actually on the list since
  // the user picked specific printings or copies. In add mode the pane fans
  // the catalog (filtered) so the user can inspect any card they're about
  // to add.
  const detailPanePrintingsByCardId = isAddMode
    ? filteredPrintingsByCardId
    : kind === "card"
      ? userScopedPrintingsByCardId
      : filteredPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      filterCounts={filterCounts}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={isAddMode ? undefined : LIST_HIDDEN_FILTER_SECTIONS}
    >
      <CardViewer
        items={items}
        totalItems={totalListItems}
        renderCard={renderCard}
        toolbar={toolbar}
        leftPane={leftPane}
        aboveGrid={aboveGrid}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          // Copy-kind lists are quantity-fixed (a copy = one physical card),
          // so the stepper is hidden and we use the narrow column with a
          // trash-only action. Card/printing lists get the wide column with
          // the full stepper.
          actionsColumn: kind === "copy" ? "narrow" : "wide",
          actionsLabel: "",
          // Table row keys mirror grid item keys: in copies view that's the
          // entry id (so each row's Remove targets that specific entry); in
          // cards/printings view it's the printing id and we resolve via the
          // entry-by-item map.
          actionsCell: (
            <ListActionsCell
              kind={kind}
              entryByItemId={entryByItemId}
              entriesByPrintingId={entriesByPrintingId}
              supportsTradePrefs={supportsTradePrefs}
              listTradeDefaults={listTradeDefaults}
              listCurrency={listCurrency}
              onEditTradePref={setPrefDialogEntryId}
              onRemoveEntry={onRemoveEntry}
              onQuantityChange={onQuantityChange}
              isRemovePendingFor={isRemovePendingFor}
              isQuantityPendingFor={isQuantityPendingFor}
            />
          ),
        }}
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
      {prefDialogEntry && (
        <TradePreferenceDialog
          open={prefDialogEntryId !== null}
          onOpenChange={(next) => {
            if (!next) {
              setPrefDialogEntryId(null);
            }
          }}
          cardName={prefDialogEntry.cardName}
          override={prefDialogEntry.tradeOverride}
          listDefault={listTradeDefaults}
          currency={listCurrency}
          isOverridden={
            prefDialogEntry.tradeOverride.pricePref !== null ||
            prefDialogEntry.tradeOverride.priceAbsoluteCents !== null ||
            prefDialogEntry.tradeOverride.tradeType !== null
          }
          onSave={(next, listCurrencyToSet) =>
            onTradeOverrideChange(prefDialogEntry.id, next, listCurrencyToSet)
          }
        />
      )}
    </CardBrowserFilterProvider>
  );
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
 * languages. An empty preference list means "show all" — same convention
 * as the rest of the filter pipeline.
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
 * Resolves list entries to a deduped array of Printings (so useCardData can
 * filter/sort them like any catalog) plus a per-printing entries map. The
 * entries-per-printing list is used in copies view to expand one tile per
 * entry, and in non-copies view to find the first entry for Remove actions.
 * @returns The deduped Printing[] and an entries-by-printing map.
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
 * Builds the items array fed into the CardViewer plus a per-item entry
 * lookup. In copies view each entry gets its own tile (item.id = entry.id);
 * in cards/printings view entries collapse to one tile per printing.
 * @returns items + a map from item.id → entry.
 */
function buildItems(
  view: "cards" | "printings" | "copies",
  sortedCards: Printing[],
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>,
): {
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
} {
  const items: CardViewerItem[] = [];
  const entryByItemId = new Map<string, ListEntryDetailResponse>();
  if (view === "copies") {
    for (const printing of sortedCards) {
      const entriesForPrinting = entriesByPrintingId.get(printing.id) ?? [];
      for (const entry of entriesForPrinting) {
        items.push({ id: entry.id, printing });
        entryByItemId.set(entry.id, entry);
      }
    }
    return { items, entryByItemId };
  }
  for (const printing of sortedCards) {
    const first = entriesByPrintingId.get(printing.id)?.[0];
    items.push({ id: printing.id, printing });
    if (first) {
      entryByItemId.set(printing.id, first);
    }
  }
  return { items, entryByItemId };
}

/**
 * Picks the printing to render / drive the catalog pipeline for an entry.
 * Printing and copy variants carry their own `printingId` (for copy it's the
 * underlying printing of the physical copy). Card variants fall back to the
 * card's first known printing — "any printing acceptable".
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

/**
 * Items for add mode — one tile per printing in the (filtered) catalog,
 * with an empty entry-lookup map since most catalog tiles have no entry on
 * the list. The renderer reads quantities via the kind-keyed `entryByKey`
 * map instead.
 * @returns items + an empty entry-by-item-id map.
 */
function buildItemsFromCatalog(sortedCards: Printing[]): {
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
} {
  const items: CardViewerItem[] = sortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));
  return { items, entryByItemId: new Map() };
}

/**
 * Keyed entry lookup for the add-mode strip's quantity display and `[-]`
 * action. Cards-kind lists key by `cardId` (one entry per card with quantity);
 * printing-kind lists key by `printingId`. Copy-kind lists have no add mode,
 * so the function returns an empty map there.
 * @returns Map keyed by cardId or printingId → entry.
 */
function buildEntryByKey(
  kind: ListKind,
  entries: readonly ListEntryDetailResponse[],
): Map<string, ListEntryDetailResponse> {
  const result = new Map<string, ListEntryDetailResponse>();
  if (kind === "copy") {
    return result;
  }
  for (const entry of entries) {
    if (kind === "card" && entry.kind === "card") {
      result.set(entry.cardId, entry);
    } else if (kind === "printing" && entry.kind === "printing") {
      result.set(entry.printingId, entry);
    }
  }
  return result;
}
