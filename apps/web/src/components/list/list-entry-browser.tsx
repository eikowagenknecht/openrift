import type {
  CardTradeLiveAnnotation,
  Currency,
  ListEntryDetailResponse,
  ListKind,
  ListRule,
  TradePreference,
} from "@openrift/shared";
import { LibraryBigIcon, ListIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { SelectModeActions } from "@/components/cards/select-mode-actions";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { ListActionsCell } from "@/components/list/list-actions-cell";
import { ListGridCell } from "@/components/list/list-grid-cell";
import { ListRemoveDialog } from "@/components/list/list-remove-dialog";
import { buildListTradeIndex } from "@/components/list/list-trade-status";
import { MoveCopiesToCollectionDialog } from "@/components/list/move-copies-to-collection-dialog";
import { MoveToListDialog } from "@/components/list/move-to-list-dialog";
import { TakeOffTradelistDialog } from "@/components/list/take-off-tradelist-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { TradePreferenceDialog } from "@/components/trade-preferences/trade-preference-dialog";
import { Toggle } from "@/components/ui/toggle";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useLiveTradesByPrinting } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useListEntryBrowserData } from "@/hooks/use-list-entry-browser-data";
import { useListEntryBrowserSelection } from "@/hooks/use-list-entry-browser-selection";
import { FilterSearchProvider, useFilterSearch } from "@/lib/search-schemas";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

// Browse mode: lists carry their own per-entry data, so the catalog-wide
// owned/customTags filter sections aren't meaningful. They're re-enabled in
// add mode (where the grid IS the catalog) — see the `hiddenSections` branch
// in ListEntryBrowser. Markers and channels stay visible in both modes: they
// are printing-level attributes a listed promo printing can carry, and both
// sections self-hide when nothing on the list has one.
const LIST_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);

// Stable empty so a logged-out or still-loading trades query doesn't hand the
// index builder a fresh array on every render, which would rebuild the index
// and break the grid cells' memo.
const NO_TRADE_ANNOTATIONS: readonly CardTradeLiveAnnotation[] = [];

export interface ListEntryBrowserProps {
  listId: string;
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  /** The list's dynamic rules (ADR-034) — needed to compute the exclude PATCH. */
  rules: ListRule[];
  entries: ListEntryDetailResponse[];
  /**
   * Renders the page top bar. Select mode lives in this component but its
   * buttons belong in the bar the page owns, so the page hands the assembly
   * back as a callback: it gets the select cluster and returns the finished bar.
   */
  renderTopBar: (selectActions: ReactNode) => ReactNode;
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
export function ListEntryBrowser({
  listId,
  kind,
  intent,
  listTradeDefaults,
  listCurrency,
  rules,
  entries,
  renderTopBar,
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
  const {
    allPrintings,
    sets,
    display,
    showImages,
    groupBy,
    groupDir,
    hasActiveFilters,
    view,
    dataView,
    listPrintings,
    entriesByPrintingId,
    filteredPrintingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
    userScopedPrintingsByCardId,
    items,
    entryByItemId,
    entryByKey,
  } = useListEntryBrowserData({ kind, entries, showLibrary });
  const isMobile = useIsMobile();

  // Live-trade status for the whole grid, resolved once. Annotations name a
  // printing, so card-kind wish entries need the catalog to get from the
  // traded printing back to the card the entry wants.
  const { printingsById } = useCards();
  const { data: liveTrades } = useLiveTradesByPrinting();
  const tradeIndex = buildListTradeIndex(
    liveTrades?.annotations ?? NO_TRADE_ANNOTATIONS,
    printingsById,
  );

  // Sibling-swap overrides live in the shared store (scope: "list"). Reset
  // when this browser unmounts (listId change) so a pin on a previous list
  // doesn't leak in.
  useEffect(() => {
    useSiblingOverrideStore.getState().clearScope("list");
    return () => useSiblingOverrideStore.getState().clearScope("list");
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once-on-mount, once-on-unmount
  }, []);

  const { setSearch } = useFilterActions();

  const {
    mode,
    selected,
    clearSelection,
    enterSelectMode,
    exitSelectMode,
    selectAll,
    isAllSelected,
    hasSelectableEntries,
    moveOpen,
    setMoveOpen,
    handleBulkMove,
    moveEntries,
    removeOpen,
    setRemoveOpen,
    handleBulkRemove,
    actionEntryIds,
    bulkRemove,
    takeOffOpen,
    setTakeOffOpen,
    handleTakeOffKeep,
    handleTakeOffSold,
    disposeCopies,
    takeOffMemberships,
    takeOffReservedCount,
    moveToCollectionOpen,
    setMoveToCollectionOpen,
    moveCopyIds,
    openListAction,
    handleSearchAndClose,
    moveTargetLists,
    selectedCard,
    gridSelectedId,
  } = useListEntryBrowserSelection({
    listId,
    kind,
    intent,
    rules,
    entries,
    showLibrary,
    isMobile,
    view,
    groupBy,
    allPrintings,
    items,
    entryByItemId,
    entryByKey,
    setSearch,
    setPrefDialogEntryId,
    onRemoveEntry,
    onQuantityChange,
    isQuantityPendingFor,
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
      tradeIndex={tradeIndex}
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

  // Select mode is only meaningful over the list's own entries — no manage
  // button in library (catalog) mode, where most tiles have no entry.
  const selectActions = showLibrary ? null : (
    <SelectModeActions
      mode={mode}
      view={view}
      isAllSelected={isAllSelected}
      hasSelectableItems={hasSelectableEntries}
      onEnterSelect={enterSelectMode}
      onExitSelect={exitSelectMode}
      onSelectAll={selectAll}
    />
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
      extras={showLibraryButton}
    />
  );

  // The detail-pane picker lists every printing of the clicked card from the
  // global catalog, scoped to the user's language prefs — not just the
  // printings on the list or the ones surviving the grid filters. The in-tile
  // siblings fan keeps its per-kind scoping; only the pane fans out.
  const detailPanePrintingsByCardId = userScopedPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  // Override the filter-search `view` so the SearchBar's unit count matches the
  // locked view. Without this it falls back to the URL/default ("cards") on
  // printing- and copy-kind lists.
  const filterSearch = useFilterSearch();

  return (
    <FilterSearchProvider value={{ ...filterSearch, view }}>
      {renderTopBar(selectActions)}
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
          setOrder={sets}
          groupBy={groupBy}
          groupDir={groupDir}
          selectedItemId={gridSelectedId}
          siblingPrintings={selectedCard ? siblingsSource.get(selectedCard.cardId) : undefined}
          renderCard={renderCard}
          toolbar={toolbar}
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
                tradeIndex={tradeIndex}
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
          <MoveCopiesToCollectionDialog
            listId={listId}
            copyIds={moveCopyIds}
            open={moveToCollectionOpen}
            onOpenChange={setMoveToCollectionOpen}
            onMoved={clearSelection}
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
              // prefDialogEntryId is the real entry id the dialog was opened for
              // (set only for editable entries; rule entries never open it).
              onTradeOverrideChange(prefDialogEntryId ?? "", next, listCurrencyToSet)
            }
          />
        )}
      </CardBrowserFilterProvider>
    </FilterSearchProvider>
  );
}
