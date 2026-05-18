import type { ListEntryDetailResponse, ListIntent, ListKind, Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  HandshakeIcon,
  HeartIcon,
  ListIcon,
  ListPlusIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
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
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { listKindIcon, listKindLabel } from "@/components/list/create-list-dialog";
import { DeleteListDialog } from "@/components/list/delete-list-dialog";
import { ListAddStrip } from "@/components/list/list-add-strip";
import { ListEntryContextMenu } from "@/components/list/list-entry-context-menu";
import { ListEntryQuantityStrip } from "@/components/list/list-entry-quantity-strip";
import { ListEntryTableActions } from "@/components/list/list-entry-table-actions";
import { ListExportDialog } from "@/components/list/list-export-dialog";
import { ListShareDialog } from "@/components/list/list-share-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
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
import { Input } from "@/components/ui/input";
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

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const INTENT_LABEL: Record<ListIntent, string> = {
  buy: "Buy",
  sell: "Sell",
  organize: "Organize",
};

const INTENT_ICON: Record<ListIntent, IconComponent> = {
  buy: HeartIcon,
  sell: HandshakeIcon,
  organize: FolderIcon,
};

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

  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(data.list.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const removeEntry = useRemoveListEntry();
  const updateEntry = useUpdateListEntry();

  const IntentIcon = INTENT_ICON[data.list.intent];
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

  const submitRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === data.list.name) {
      setIsRenaming(false);
      setName(data.list.name);
      return;
    }
    updateList.mutate(
      { listId, name: trimmed },
      {
        onSuccess: () => setIsRenaming(false),
      },
    );
  };

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

  const entriesCount = data.entries.length;

  const topBar = (
    <PageTopBar>
      {isRenaming ? (
        <form
          className="flex flex-1 items-center gap-2 px-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <Input
            autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline rename
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={submitRename}
            className="h-8 max-w-xs"
          />
          <Button type="submit" variant="ghost" size="icon-sm" disabled={updateList.isPending}>
            <CheckIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setIsRenaming(false);
              setName(data.list.name);
            }}
          >
            <XIcon className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <PageTopBarTitle onToggleSidebar={toggleSidebar}>{data.list.name}</PageTopBarTitle>
          <Badge variant="ghost" className="text-2xs hidden shrink-0 sm:inline-flex">
            <IntentIcon className="size-3" />
            {INTENT_LABEL[data.list.intent]}
          </Badge>
          <Badge variant="ghost" className="text-2xs hidden shrink-0 sm:inline-flex">
            <KindIcon className="size-3" />
            {listKindLabel(data.list.kind)}
          </Badge>
        </>
      )}
      <PageTopBarActions>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            <EllipsisVerticalIcon className="size-4" />
            <span className="sr-only">List actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsRenaming(true)}>
              <PencilIcon className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              {data.list.shareToken === null ? "Share" : "Manage sharing"}
            </DropdownMenuItem>
            {data.list.kind === "card" && (
              <DropdownMenuItem onClick={() => setExportOpen(true)}>
                <DownloadIcon className="size-4" />
                Export
              </DropdownMenuItem>
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
      </PageTopBarActions>
    </PageTopBar>
  );

  const topBarPortal = topBarSlot && createPortal(topBar, topBarSlot);

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
        {deleteDialog}
        {shareDialog}
        {exportDialog}
      </>
    );
  }

  return (
    <>
      {topBarPortal}
      <ListEntryBrowser
        listId={listId}
        kind={data.list.kind}
        entries={data.entries}
        onRemoveEntry={handleRemoveEntry}
        onQuantityChange={handleQuantityChange}
        isRemovePendingFor={(entryId) =>
          removeEntry.isPending && removeEntry.variables?.entryId === entryId
        }
        isQuantityPendingFor={(entryId) =>
          updateEntry.isPending && updateEntry.variables?.entryId === entryId
        }
      />
      {deleteDialog}
      {shareDialog}
      {exportDialog}
    </>
  );
}

interface ListEntryBrowserProps {
  listId: string;
  kind: ListKind;
  entries: ListEntryDetailResponse[];
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
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
  entries,
  onRemoveEntry,
  onQuantityChange,
  isRemovePendingFor,
  isQuantityPendingFor,
}: ListEntryBrowserProps) {
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
            <ListAddStrip
              printing={item.printing}
              displayedCount={displayedCount}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
            />
          }
        />
      );
    }

    // Browse mode: quantity stepper above each tile, mirroring the /cards
    // owned-count strip pattern but acting on the list entry. Suppressed on
    // copy-kind lists — a copy is a single physical card by definition, so
    // quantity > 1 is meaningless. Removal still goes through the right-click
    // context menu.
    const quantityStrip =
      entry && kind !== "copy" ? (
        <ListEntryQuantityStrip
          quantity={entry.quantity}
          onIncrement={() => onQuantityChange(entry.id, entry.quantity + 1)}
          onDecrement={() => onQuantityChange(entry.id, entry.quantity - 1)}
          isPending={isQuantityPendingFor(entry.id)}
          cardName={entry.cardName}
        />
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
        strip={quantityStrip}
        contextMenu={(cell) => (
          <ListEntryContextMenu onRemove={onRemove}>{cell}</ListEntryContextMenu>
        )}
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
          renderActions: (printing, itemId) => {
            const entry = entryByItemId.get(itemId) ?? entriesByPrintingId.get(printing.id)?.[0];
            if (!entry) {
              return null;
            }
            if (kind === "copy") {
              return (
                <ListEntryTableActions
                  showQuantity={false}
                  onRemove={() => onRemoveEntry(entry.id, entry.cardName)}
                  isRemovePending={isRemovePendingFor(entry.id)}
                />
              );
            }
            return (
              <ListEntryTableActions
                showQuantity
                quantity={entry.quantity}
                onIncrement={() => onQuantityChange(entry.id, entry.quantity + 1)}
                onDecrement={() => onQuantityChange(entry.id, entry.quantity - 1)}
                onRemove={() => onRemoveEntry(entry.id, entry.cardName)}
                isQuantityPending={isQuantityPendingFor(entry.id)}
                isRemovePending={isRemovePendingFor(entry.id)}
              />
            );
          },
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
