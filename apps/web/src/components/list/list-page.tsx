import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  Printing,
  TradePreference,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckSquareIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LibraryBigIcon,
  ListIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
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
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import type { TableRowSlotProps } from "@/components/cards/card-table";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { PageTopBarButton, PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { DeleteListDialog } from "@/components/list/delete-list-dialog";
import { ListEditDialog } from "@/components/list/list-edit-dialog";
import { ListEntryTableActions } from "@/components/list/list-entry-table-actions";
import { ListExportDialog } from "@/components/list/list-export-dialog";
import { ListGridCell } from "@/components/list/list-grid-cell";
import { ListHeader } from "@/components/list/list-header";
import { ListImportDialog } from "@/components/list/list-import-dialog";
import { ListRemoveDialog } from "@/components/list/list-remove-dialog";
import { ListShareDialog } from "@/components/list/list-share-dialog";
import { MoveToListDialog } from "@/components/list/move-to-list-dialog";
import { TakeOffTradelistDialog } from "@/components/list/take-off-tradelist-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { TradePreferenceDialog } from "@/components/trade-preferences/trade-preference-dialog";
import { TradePreferencePill } from "@/components/trade-preferences/trade-preference-pill";
import { Badge } from "@/components/ui/badge";
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
import { Toggle } from "@/components/ui/toggle";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCopyListMemberships, useDisposeCopies } from "@/hooks/use-copies";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import {
  useBulkAddListEntries,
  useBulkRemoveListEntries,
  useDeleteList,
  useListDetail,
  useLists,
  useMoveListEntries,
  useRemoveListEntry,
  useUpdateList,
  useUpdateListEntry,
} from "@/hooks/use-lists";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { FilterSearchProvider, useFilterSearch } from "@/lib/search-schemas";
import { resolveContextActionTarget } from "@/lib/stack-selection";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import type { ListBulkAction } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDisplayStore } from "@/stores/display-store";
import { useListEntriesStore } from "@/stores/list-entries-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

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

  // Per-session library toggle: when on, the grid renders the whole catalog
  // so the user can add cards. Copy-kind lists can't add via the catalog (a
  // "copy" only exists inside a collection; the float-bar / sidebar DnD are
  // the canonical paths), so the toggle is hidden for them.
  const [showLibrary, setShowLibrary] = useState(false);
  const showLibraryActive = showLibrary && data.list.kind !== "copy";

  // Switching lists resets the toggle so the user doesn't land in library
  // view on the new list by surprise. Mirrors the same reset the collection
  // grid does on collectionId change.
  useEffect(() => {
    setShowLibrary(false);
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
      onManageVisibility={() => setShareOpen(true)}
      onToggleSidebar={toggleSidebar}
      actions={
        <>
          <PageTopBarButton onClick={() => setShareOpen(true)}>
            <Share2Icon className="size-4" />
            Share
          </PageTopBarButton>
          <DropdownMenu>
            <DropdownMenuTrigger render={<PageTopBarIconButton />}>
              <EllipsisVerticalIcon className="size-4" />
              <span className="sr-only">List actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <PencilIcon className="size-4" />
                Edit
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
        </>
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
      listName={data.list.name}
      intent={data.list.intent}
      kind={data.list.kind}
      tradeDefaults={data.list.tradeDefaults}
      currency={data.list.currency}
      shareToken={data.list.shareToken}
      updatedAt={data.list.updatedAt}
      entries={data.entries}
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

  // When the library is shown we fall through to the browser even with zero
  // entries — the grid renders the whole catalog so the user can start adding.
  if (entriesCount === 0 && !showLibraryActive) {
    const canShowLibrary = data.list.kind !== "copy";
    return (
      <>
        {topBarPortal}
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia>
              <KindIcon className="size-16 opacity-50" />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>
              {empty.description}{" "}
              <Link
                to="/help/$slug"
                params={{ slug: "lists" }}
                className="text-primary hover:underline"
              >
                Learn how lists work.
              </Link>
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canShowLibrary && (
              <Button onClick={() => setShowLibrary(true)}>
                <LibraryBigIcon className="size-4" />
                Show library
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
        showLibrary={showLibraryActive}
        onToggleShowLibrary={() => setShowLibrary((prev) => !prev)}
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
  /** Copy-kind only: open the keep-vs-sold chooser for the row's copy. */
  onTakeOff?: (entryId: string) => void;
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
  onTakeOff,
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
      {entry.kind === "copy" && entry.reserved && <Badge variant="success">Reserved</Badge>}
      {kind === "copy" ? (
        <ListEntryTableActions
          showQuantity={false}
          onTakeOff={() => onTakeOff?.(entry.id)}
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
  /** True when the library toggle is on (catalog mode). Never true for copy-kind lists. */
  showLibrary: boolean;
  onToggleShowLibrary: () => void;
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
  showLibrary,
  onToggleShowLibrary,
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

  // ── Select mode (bulk move / remove) ────────────────────────────────
  // Selection is keyed by entry id (one tile = one entry), reusing the shared
  // grid-selection store and the same chrome as /collections.
  const [selectMode, setSelectMode] = useState(false);
  const mode = selectMode ? "select" : "browse";
  const {
    selected,
    toggleSelect,
    clearSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
  } = useCardSelection();
  // What the Move / Remove dialogs act on — the selection from the float bar,
  // or the selection-or-single resolution from the right-click menu.
  const [actionEntryIds, setActionEntryIds] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const { data: allLists } = useLists();
  const moveEntries = useMoveListEntries();
  const bulkRemove = useBulkRemoveListEntries();

  // ── "Take off list" (copy-kind tradelists) ──────────────────────────
  // Taking a copy off a tradelist has two outcomes — kept (just unlist) or
  // sold/traded (also dispose). The chooser dialog asks which. The sold path
  // reuses the /collections dispose flow: it hard-deletes the copies (cascading
  // them off every list, including this one) and warns about the *other* lists
  // they also sit on — `listId` is excluded so this list isn't named.
  const userId = useUserId();
  const queryClient = useQueryClient();
  const [takeOffOpen, setTakeOffOpen] = useState(false);
  const disposeCopies = useDisposeCopies();
  // Resolve list-entry ids to the physical copy ids dispose operates on.
  const copyIdByEntryId = new Map(
    entries.flatMap((entry) => (entry.kind === "copy" ? [[entry.id, entry.copyId] as const] : [])),
  );
  const entriesToCopyIds = (entryIds: readonly string[]): string[] =>
    entryIds.flatMap((entryId) => {
      const copyId = copyIdByEntryId.get(entryId);
      return copyId ? [copyId] : [];
    });
  const takeOffCopyIds = entriesToCopyIds(actionEntryIds);
  const takeOffMemberships = useCopyListMemberships(takeOffCopyIds, takeOffOpen, listId);
  // Copies pinned to a live trade can't be sold (disposing breaks the trade),
  // so the chooser blocks the sold outcome when any target is reserved.
  const reservedEntryIds = new Set(
    entries.flatMap((entry) => (entry.kind === "copy" && entry.reserved ? [entry.id] : [])),
  );
  const takeOffReservedCount = actionEntryIds.filter((id) => reservedEntryIds.has(id)).length;

  // Drop any in-progress selection when the list changes, and force browse
  // mode in the catalog (library) view where most tiles have no entry to act
  // on. Mirrors the collection grid's resets.
  useEffect(() => {
    setSelectMode(false);
    clearSelection();
  }, [listId, clearSelection]);
  useEffect(() => {
    if (showLibrary) {
      setSelectMode(false);
      clearSelection();
    }
  }, [showLibrary, clearSelection]);

  // Sibling-swap overrides live in the shared store (scope: "list"). Reset
  // when this browser unmounts (listId change) so a pin on a previous list
  // doesn't leak in.
  useEffect(() => {
    useSiblingOverrideStore.getState().clearScope("list");
    return () => useSiblingOverrideStore.getState().clearScope("list");
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once-on-mount, once-on-unmount
  }, []);

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
    // Only thread the owned-count map when the owned-bucket filter is
    // actually active. Otherwise the global map mutates on every +/- and
    // invalidates this hook's "use memo" cache, rebuilding every cell's
    // siblings / priceRange refs on every entry mutation. Mirrors the
    // guards in /cards and /collections.
    ownedCountByPrinting: filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const sortedCards = showLibrary ? catalogSortedCards : listSortedCards;
  const filteredPrintingsByCardId = showLibrary ? catalogPrintingsByCardId : listPrintingsByCardId;
  const priceRangeByCardId = showLibrary ? catalogPriceRangeByCardId : listPriceRangeByCardId;
  const availableFilters = showLibrary ? catalogAvailableFilters : listAvailableFilters;
  const availableLanguages = showLibrary ? catalogAvailableLanguages : listAvailableLanguages;
  const filterCounts = showLibrary ? catalogFilterCounts : listFilterCounts;
  const setDisplayLabel = showLibrary ? catalogSetDisplayLabel : listSetDisplayLabel;
  const totalUniqueCards = showLibrary ? catalogTotalUniqueCards : listTotalUniqueCards;
  const filteredCount = showLibrary ? catalogFilteredCount : listFilteredCount;

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
  const { items, entryByItemId } = showLibrary
    ? buildItemsFromCatalog(sortedCards)
    : buildItems(view, sortedCards, entriesByPrintingId);

  // ── Entry lookup for library mode + quantity display ─────────────────
  // Keyed by cardId on card-kind lists and printingId on printing-kind lists.
  // Quantity comes straight from `entry.quantity`. Mutations write to the
  // query cache optimistically (see useBulkAddListEntries / useUpdateListEntry),
  // so rapid +/- clicks reflect immediately without a separate pending store.
  const entryByKey = buildEntryByKey(kind, entries);
  const bulkAddEntries = useBulkAddListEntries();
  const updateEntryMutation = useUpdateListEntry();

  // Feed the per-cell entry store so cells can self-subscribe by key without
  // taking parent-derived maps as unstable props. Effect deps include the
  // recomputed maps directly — when entries don't change, the upstream maps'
  // identities are stable across renders.
  useEffect(() => {
    useListEntriesStore.getState().setEntries(entryByItemId, entryByKey);
  }, [entryByItemId, entryByKey]);

  // When grouping by set in cards view, each (cardId, setId) gets its own
  // tile, so clicks need to navigate by printing rather than card — same
  // reason as CardBrowser / public collection share.
  const findBy: "card" | "printing" = view === "cards" && groupBy !== "set" ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleCardClick(printing);
    useSiblingOverrideStore.getState().setOverride("list", printing.cardId, printing.id);
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

  // ── Select-mode handlers ─────────────────────────────────────────────
  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) {
        clearSelection();
      }
      return !prev;
    });
  };

  // Shift-click range select: every entry between the last-clicked tile and
  // this one, in display order. One tile = one entry, so no stack expansion.
  const shiftSelectRange = (itemId: string) => {
    const targetEntry = entryByItemId.get(itemId);
    if (!targetEntry) {
      return;
    }
    const lastId = getLastSelectedItemId();
    const startIdx = lastId === null ? -1 : items.findIndex((item) => item.id === lastId);
    const endIdx = items.findIndex((item) => item.id === itemId);
    if (startIdx === -1 || endIdx === -1) {
      toggleSelect(targetEntry.id);
      setLastSelectedItemId(itemId);
      return;
    }
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const rangeIds: string[] = [];
    for (let idx = lo; idx <= hi; idx++) {
      const rangeEntry = entryByItemId.get(items[idx].id);
      if (rangeEntry) {
        rangeIds.push(rangeEntry.id);
      }
    }
    addToSelection(rangeIds);
    setLastSelectedItemId(itemId);
  };

  // Snapshot the target entry ids, then open the matching dialog. Copy-kind
  // take-off and card/printing remove both target entry ids; the take-off
  // chooser derives copy ids for its sold branch from them.
  const openListAction = (action: ListBulkAction, entryIds: string[]) => {
    setActionEntryIds(entryIds);
    if (action === "move") {
      setMoveOpen(true);
    } else if (action === "takeOff") {
      setTakeOffOpen(true);
    } else {
      setRemoveOpen(true);
    }
  };

  const handleBulkMove = (toListId: string) => {
    moveEntries.mutate(
      { fromListId: listId, toListId, entryIds: actionEntryIds },
      {
        onSuccess: (result) => {
          toast.success(`Moved ${result.moved} card${result.moved === 1 ? "" : "s"} to list`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleBulkRemove = () => {
    const count = actionEntryIds.length;
    bulkRemove.mutate(
      { listId, entryIds: actionEntryIds },
      {
        onSuccess: () => {
          toast.success(`Removed ${count} card${count === 1 ? "" : "s"} from list`);
          clearSelection();
          setRemoveOpen(false);
        },
      },
    );
  };

  // Take-off outcome 1 — kept: just unlist the entries, copies stay put.
  const handleTakeOffKeep = () => {
    const count = actionEntryIds.length;
    bulkRemove.mutate(
      { listId, entryIds: actionEntryIds },
      {
        onSuccess: () => {
          toast.success(`Removed ${count} card${count === 1 ? "" : "s"} from list`);
          clearSelection();
          setTakeOffOpen(false);
        },
      },
    );
  };

  // Take-off outcome 2 — sold/traded: dispose the backing copies.
  const handleTakeOffSold = () => {
    const count = takeOffCopyIds.length;
    disposeCopies.mutate(
      { copyIds: takeOffCopyIds },
      {
        onSuccess: () => {
          toast.success(`Marked ${count} card${count === 1 ? "" : "s"} as sold`);
          clearSelection();
          setTakeOffOpen(false);
          // Dispose hard-deletes the copies and cascades their list entries
          // away server-side, so refresh this list (and the sidebar counts) to
          // drop the now-deleted entries from view.
          if (userId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.lists.detail(userId, listId),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
          }
        },
      },
    );
  };

  // Register list-grid action dispatchers so the per-cell ListGridCell can
  // hand off click / +/- / remove / set-preference without taking parent
  // closures as props. Re-register every render so handlers close over the
  // freshest mutation results and pending flags.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleCardClick,
      onSiblingClick: handleSiblingClick,
      onIncrement: handleIncrement,
      onDecrement: handleDecrement,
      // Grid tile click: browse opens the detail pane; select toggles the
      // tile's entry (shift extends the range).
      onItemClick: (itemId, printing, modifiers) => {
        if (mode === "browse") {
          handleCardClick(printing);
          return;
        }
        const entry = entryByItemId.get(itemId);
        if (!entry) {
          return;
        }
        if (modifiers.shift) {
          shiftSelectRange(itemId);
        } else {
          toggleSelect(entry.id);
          setLastSelectedItemId(itemId);
        }
      },
      onItemToggle: (itemId) => {
        const entry = entryByItemId.get(itemId);
        if (!entry) {
          return;
        }
        toggleSelect(entry.id);
        setLastSelectedItemId(itemId);
      },
      onListBulkAction: (entryId, action) => {
        // Same selection-or-single resolution as the collection right-click
        // menu — entries are singular ids, so stacked: false.
        const { copyIds, narrowSelectionTo } = resolveContextActionTarget({
          mode,
          stacked: false,
          itemId: entryId,
          cardCopyIds: [entryId],
          selected,
        });
        if (narrowSelectionTo) {
          clearSelection();
          addToSelection(narrowSelectionTo);
          setLastSelectedItemId(entryId);
        }
        openListAction(action, copyIds);
      },
      onEntryQuantityChange: (entryId, quantity) => {
        // Library-mode decrement passes empty entryId when there's no entry;
        // the cell already disables the button in that case but guard here too.
        if (!entryId) {
          return;
        }
        onQuantityChange(entryId, quantity);
      },
      onRemoveEntry: (entryId, cardName) => onRemoveEntry(entryId, cardName),
      onSetPreference: (entryId) => setPrefDialogEntryId(entryId),
      isQuantityPendingFor: (entryId) => isQuantityPendingFor(entryId),
    });
    return () => {
      useCardRowActionsStore.getState().setHandlers({});
    };
  });

  // Fan-out behind each tile (cards view only):
  //   - browse + card-kind: every printing of the card in the user's
  //     preferred languages (entry doesn't pin a specific printing)
  //   - browse + other kinds: only the printings already on the list
  //   - library + cards view: every printing of the card per catalog filters
  //     (the visible fan should match what's filtered)
  const siblingsSource = showLibrary
    ? filteredPrintingsByCardId
    : kind === "card"
      ? userScopedPrintingsByCardId
      : filteredPrintingsByCardId;

  // Thin wrapper — the cell takes only stable item-level props and
  // self-subscribes to its sibling override + entry data so a single entry
  // mutation only re-renders the affected cell.
  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <ListGridCell
      printing={item.printing}
      itemId={item.id}
      cardWidth={ctx.cardWidth}
      priority={ctx.priority}
      dataView={dataView}
      view={view}
      kind={kind}
      intent={intent}
      listId={listId}
      listTradeDefaults={listTradeDefaults}
      listCurrency={listCurrency}
      mode={mode}
      showLibrary={showLibrary}
      supportsTradePrefs={supportsTradePrefs}
      siblings={view === "cards" ? siblingsSource.get(item.printing.cardId) : undefined}
      display={display}
      showImages={showImages}
      priceRange={priceRangeByCardId?.get(item.printing.cardId)}
    />
  );

  const totalDisplay = view === "copies" && !showLibrary ? items.length : totalUniqueCards;
  const filteredDisplay = view === "copies" && !showLibrary ? items.length : filteredCount;
  const totalListItems = showLibrary
    ? allPrintings.length
    : view === "copies"
      ? entries.length
      : listPrintings.length;

  // Persistent primary fill for the active state, matching the prior variant="default" look.
  const activeToggleClass =
    "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

  const showLibraryButton =
    kind === "copy" ? null : (
      <Toggle
        variant="outline"
        pressed={showLibrary}
        onPressedChange={onToggleShowLibrary}
        className={activeToggleClass}
        title={showLibrary ? "Hide library" : "Show whole library"}
        aria-label={showLibrary ? "Hide library" : "Show whole library"}
      >
        <LibraryBigIcon className="size-4" />
      </Toggle>
    );

  // Select mode is only meaningful over the list's own entries — hide the
  // toggle in library (catalog) mode where most tiles have no entry.
  const selectButton = showLibrary ? null : (
    <Toggle
      variant="outline"
      pressed={selectMode}
      onPressedChange={toggleSelectMode}
      className={activeToggleClass}
      title={selectMode ? "Exit select mode" : "Select cards"}
      aria-label={selectMode ? "Exit select mode" : "Select cards"}
    >
      <CheckSquareIcon className="size-4" />
    </Toggle>
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
      extras={
        <>
          {selectButton}
          {showLibraryButton}
        </>
      }
    />
  );

  // Move targets: same kind + intent (the API rejects mismatches), this list
  // excluded.
  const moveTargetLists = allLists.filter(
    (list) => list.id !== listId && list.kind === kind && list.intent === intent,
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
  const detailPanePrintingsByCardId = showLibrary
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

  // Override the filter-search `view` so the SearchBar's "Search X..." label
  // and unit count match the locked view. Without this it falls back to the
  // URL/default ("cards") on printing- and copy-kind lists.
  const filterSearch = useFilterSearch();

  return (
    <FilterSearchProvider value={{ ...filterSearch, view }}>
      <CardBrowserFilterProvider
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        filterCounts={filterCounts}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={showLibrary ? undefined : LIST_HIDDEN_FILTER_SECTIONS}
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
                onTakeOff={
                  kind === "copy" ? (entryId) => openListAction("takeOff", [entryId]) : undefined
                }
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
          {mode === "select" && selected.size > 0 && (
            <FloatingActionBar
              selectedCount={selected.size}
              actions={[
                {
                  label: "Move",
                  icon: <ListIcon />,
                  onClick: () => openListAction("move", [...selected]),
                  disabled: moveEntries.isPending,
                },
                // Copy-kind tradelists collapse remove + sold into one "Take off
                // list" action that opens the keep-vs-sold chooser; other kinds
                // have no copy to dispose, so they keep a plain Remove.
                kind === "copy"
                  ? {
                      label: "Take off list",
                      icon: <XIcon />,
                      variant: "destructive" as const,
                      onClick: () => openListAction("takeOff", [...selected]),
                      disabled: bulkRemove.isPending || disposeCopies.isPending,
                    }
                  : {
                      label: "Remove",
                      icon: <Trash2Icon />,
                      variant: "destructive" as const,
                      onClick: () => openListAction("remove", [...selected]),
                      disabled: bulkRemove.isPending,
                    },
              ]}
              onClear={clearSelection}
            />
          )}
          <MoveToListDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            lists={moveTargetLists}
            onMove={handleBulkMove}
            isPending={moveEntries.isPending}
          />
          <ListRemoveDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            count={actionEntryIds.length}
            onConfirm={handleBulkRemove}
            isPending={bulkRemove.isPending}
          />
          <TakeOffTradelistDialog
            open={takeOffOpen}
            onOpenChange={setTakeOffOpen}
            count={actionEntryIds.length}
            onKeep={handleTakeOffKeep}
            onSold={handleTakeOffSold}
            isPending={bulkRemove.isPending || disposeCopies.isPending}
            memberships={takeOffMemberships.data}
            membershipsLoading={takeOffMemberships.isLoading}
            reservedCount={takeOffReservedCount}
          />
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
    </FilterSearchProvider>
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
