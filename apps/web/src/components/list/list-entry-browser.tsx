import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  ListRule,
  Printing,
  TradePreference,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquareIcon, LibraryBigIcon, ListIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { ListActionsCell } from "@/components/list/list-actions-cell";
import {
  buildEntryByKey,
  buildItems,
  buildItemsFromCatalog,
  collectListPrintings,
  kindToView,
} from "@/components/list/list-entries";
import { ListGridCell } from "@/components/list/list-grid-cell";
import { ListRemoveDialog } from "@/components/list/list-remove-dialog";
import { MoveToListDialog } from "@/components/list/move-to-list-dialog";
import { TakeOffTradelistDialog } from "@/components/list/take-off-tradelist-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { TradePreferenceDialog } from "@/components/trade-preferences/trade-preference-dialog";
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
  useLists,
  useMoveListEntries,
  useUpdateList,
  useUpdateListEntry,
} from "@/hooks/use-lists";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession, useUserId } from "@/lib/auth-session";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { queryKeys } from "@/lib/query-keys";
import type { RuleExcludeTarget } from "@/lib/rule-exclude";
import { excludeEntryFromRules } from "@/lib/rule-exclude";
import { FilterSearchProvider, useFilterSearch } from "@/lib/search-schemas";
import { resolveContextActionTarget } from "@/lib/stack-selection";
import type { ListBulkAction } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDisplayStore } from "@/stores/display-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useListEntriesStore } from "@/stores/list-entries-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

// Browse mode: lists carry their own per-entry data, so the catalog-wide
// owned/customTags filter sections aren't meaningful. They're re-enabled in
// add mode (where the grid IS the catalog) — see the `hiddenSections` branch
// in ListEntryBrowser. Markers and channels stay visible in both modes: they
// are printing-level attributes a listed promo printing can carry, and both
// sections self-hide when nothing on the list has one.
const LIST_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);

export interface ListEntryBrowserProps {
  listId: string;
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  /** The list's dynamic rules (ADR-034) — needed to compute the exclude PATCH. */
  rules: ListRule[];
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
export function ListEntryBrowser({
  listId,
  kind,
  intent,
  listTradeDefaults,
  listCurrency,
  rules,
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
  const updateList = useUpdateList();

  // Excluding a rule-produced entry (ADR-034): append its id to every rule that
  // currently yields it, then re-save. No-op when nothing matches.
  const handleExcludeFromRule = (target: RuleExcludeTarget) => {
    const next = excludeEntryFromRules(rules, target, allPrintings);
    if (!next) {
      return;
    }
    updateList.mutate(
      { listId, rules: next },
      { onError: () => toast.error("Couldn't update the rule") },
    );
  };

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

  const { filters, sortBy, sortDir, groupBy, groupDir, hasActiveFilters } = useFilterValues();
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
    // Browse mode hides the catalog-wide owned/customTags sections (see
    // LIST_HIDDEN_FILTER_SECTIONS), so the owned-count map wouldn't drive
    // any visible UI here.
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

  // Light up the clicked tile the same way /cards and /collections do. Mirrors
  // BrowserCardViewer: resolve the anchored grid cell from the selection store
  // and push its id into grid-focus-store so each cell can self-subscribe to
  // "am I selected?" via a granular selector. Setting null on mount / deselect
  // also clears any stale highlight left over from a prior card-browser page.
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
  const indexAnchor =
    selectedIndex >= 0 && selectedIndex < items.length ? items[selectedIndex] : undefined;
  const gridSelectedId =
    indexAnchor?.id ??
    (selectedCard
      ? (items.find((item) => item.printing.id === selectedCard.id)?.id ??
        (view === "cards"
          ? items.find((item) => item.printing.cardId === selectedCard.cardId)?.id
          : undefined))
      : undefined);
  useEffect(() => {
    useGridFocusStore.getState().setSelectedItemId(gridSelectedId ?? null);
  }, [gridSelectedId]);

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
    // Rule-derived entries (null id, ADR-034) can't be decremented.
    if (!entry || entry.id === null || entry.quantity <= 1) {
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
      // Rule-derived entries (null id, ADR-034) aren't selectable.
      if (targetEntry.id !== null) {
        toggleSelect(targetEntry.id);
        setLastSelectedItemId(itemId);
      }
      return;
    }
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const rangeIds: string[] = [];
    for (let idx = lo; idx <= hi; idx++) {
      const rangeEntry = entryByItemId.get(items[idx].id);
      if (rangeEntry && rangeEntry.id !== null) {
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
        // Rule-derived entries (null id, ADR-034) aren't selectable.
        if (!entry || entry.id === null) {
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
        // Rule-derived entries (null id, ADR-034) aren't selectable.
        if (!entry || entry.id === null) {
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
      onExcludeFromRule: handleExcludeFromRule,
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
