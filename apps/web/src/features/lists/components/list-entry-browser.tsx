import type {
  CardTradeLiveAnnotation,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import type { Currency, TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { ListRule } from "@openrift/shared/types/list-rule";
import { LibraryBigIcon, ListIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Toggle } from "@/components/ui/toggle";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/features/cards/components/card-browser-filter-scaffold";
import { CardViewer } from "@/features/cards/components/card-viewer";
import { SelectModeActions } from "@/features/cards/components/select-mode-actions";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { useFilterActions } from "@/features/cards/hooks/use-card-filters";
import { useCards } from "@/features/cards/hooks/use-cards";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { FilterSearchProvider, useFilterSearch } from "@/features/cards/lib/search-schemas";
import { useSiblingOverrideStore } from "@/features/cards/stores/sibling-override-store";
import { FloatingActionBar } from "@/features/collections/components/floating-action-bar";
import { TradePreferenceDialog } from "@/features/groups/components/trade-preference-dialog";
import { useLiveTradesByPrinting, useUserTrades } from "@/features/groups/hooks/use-card-trades";
import { ListActionsCell } from "@/features/lists/components/list-actions-cell";
import { ListGridCell } from "@/features/lists/components/list-grid-cell";
import { ListIntroBanner } from "@/features/lists/components/list-intro-banner";
import { ListRemoveDialog } from "@/features/lists/components/list-remove-dialog";
import { buildListTradeIndex } from "@/features/lists/components/list-trade-status";
import { MoveCopiesToCollectionDialog } from "@/features/lists/components/move-copies-to-collection-dialog";
import { MoveToListDialog } from "@/features/lists/components/move-to-list-dialog";
import { TakeOffTradelistDialog } from "@/features/lists/components/take-off-tradelist-dialog";
import { useListEntryBrowserData } from "@/features/lists/hooks/use-list-entry-browser-data";
import { useListEntryBrowserSelection } from "@/features/lists/hooks/use-list-entry-browser-selection";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";

const LIST_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);

// Stable reference: a fresh array here would rebuild the trade index every
// render and break the grid cells' memo.
const NO_TRADE_ANNOTATIONS: readonly CardTradeLiveAnnotation[] = [];
const NO_TRADES: readonly CardTradeResponse[] = [];

export interface ListEntryBrowserProps {
  listId: string;
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  rules: ListRule[];
  entries: ListEntryDetailResponse[];
  renderTopBar: (selectActions: ReactNode) => ReactNode;
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

  // Trade annotations name a printing; card-kind wish entries need the
  // catalog to map that printing back to the card the entry wants.
  const { printingsById } = useCards();
  const { data: liveTrades } = useLiveTradesByPrinting();
  const { data: userTrades } = useUserTrades();
  const tradeIndex = buildListTradeIndex(
    liveTrades?.annotations ?? NO_TRADE_ANNOTATIONS,
    printingsById,
    userTrades?.items ?? NO_TRADES,
  );

  // Clear on unmount so a sibling-swap pin from a previous list doesn't leak in.
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

  const siblingsSource = showLibrary
    ? filteredPrintingsByCardId
    : kind === "card"
      ? userScopedPrintingsByCardId
      : filteredPrintingsByCardId;

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

  // The detail pane always fans out to every printing of the card, unlike
  // the in-tile siblings fan which keeps its per-kind scoping.
  const detailPanePrintingsByCardId = userScopedPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  const introDismissed = useOnboardingStore((state) => state.dismissedIntros.includes("list"));
  const dismissIntro = useOnboardingStore((state) => state.dismissIntro);

  // Without overriding `view` here the SearchBar falls back to the
  // URL/default ("cards") on printing- and copy-kind lists.
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
          banner={
            introDismissed ? null : (
              <ListIntroBanner intent={intent} kind={kind} onDismiss={() => dismissIntro("list")} />
            )
          }
          rightPane={rightPane}
          addStripHeight={ADD_STRIP_HEIGHT}
          table={{
            actionsColumn: kind === "copy" ? "narrow" : "wide",
            actionsLabel: "",
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
          <SelectionDetailOverlays
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
          />
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
          {/* Mounted only while open: it reads collections via a suspense query,
              and mounted-but-closed would suspend into the page's boundary. */}
          {moveToCollectionOpen && (
            <MoveCopiesToCollectionDialog
              listId={listId}
              copyIds={moveCopyIds}
              open={moveToCollectionOpen}
              onOpenChange={setMoveToCollectionOpen}
              onMoved={clearSelection}
            />
          )}
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
              onTradeOverrideChange(prefDialogEntryId ?? "", next, listCurrencyToSet)
            }
          />
        )}
      </CardBrowserFilterProvider>
    </FilterSearchProvider>
  );
}
