import type {
  GroupByField,
  ListEntryDetailResponse,
  ListKind,
  ListRule,
  Printing,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { resolveCopyMoveTarget, selectableEntryIds } from "@/components/list/list-entries";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCopyListMemberships, useDisposeCopies } from "@/hooks/use-copies";
import {
  useBulkAddListEntries,
  useBulkRemoveListEntries,
  useLists,
  useMoveListEntries,
  useUpdateList,
  useUpdateListEntry,
} from "@/hooks/use-lists";
import { useRowActionHandlers } from "@/hooks/use-row-action-handlers";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import type { RuleExcludeTarget } from "@/lib/rule-exclude";
import { excludeEntryFromRules } from "@/lib/rule-exclude";
import { computeShiftRange, resolveContextActionTarget } from "@/lib/stack-selection";
import type { CardRowClickModifiers, ListBulkAction } from "@/stores/card-row-actions-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

export interface UseListEntryBrowserSelectionParams {
  listId: string;
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  /** The list's dynamic rules (ADR-034) — needed to compute the exclude PATCH. */
  rules: ListRule[];
  entries: ListEntryDetailResponse[];
  /** True when the library toggle is on (catalog mode). Never true for copy-kind lists. */
  showLibrary: boolean;
  isMobile: boolean;
  view: "cards" | "printings" | "copies";
  groupBy: GroupByField;
  allPrintings: Printing[];
  items: CardViewerItem[];
  entryByItemId: Map<string, ListEntryDetailResponse>;
  entryByKey: Map<string, ListEntryDetailResponse>;
  setSearch: (query: string) => void;
  setPrefDialogEntryId: (entryId: string | null) => void;
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
  isQuantityPendingFor: (entryId: string) => boolean;
}

/**
 * Select mode (bulk move / remove), the "take off list" flow, grid click /
 * detail-pane selection, and the row-actions-store registration effect for
 * `ListEntryBrowser`. Takes the data-hook's `items` / `entryByItemId` /
 * `entryByKey` as parameters (rather than reading them from a ref) so every
 * handler closure captures the freshest values on each render.
 * @param params - List identity/props, the data-hook outputs the handlers close over, and the parent-owned setters they call into.
 * @returns Flat object of select-mode state, take-off state, and the handlers `ListEntryBrowser` renders with.
 */
export function useListEntryBrowserSelection({
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
}: UseListEntryBrowserSelectionParams) {
  // ── Select mode (bulk move / remove) ────────────────────────────────
  // Selection is keyed by entry id (one tile = one entry), reusing the shared
  // grid-selection store and the same chrome as /collections.
  const {
    selected,
    selectMode,
    setSelectMode,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    resetSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
  } = useCardSelection();
  const mode: "browse" | "select" = selectMode ? "select" : "browse";
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
    // No onError: a per-call handler runs in ADDITION to the global
    // mutation onError, which already toasts the server's message.
    updateList.mutate({ listId, rules: next });
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

  // ── "Move to collection" (copy-kind lists) ──────────────────────────
  // Filing the physical copies behind the entries somewhere else — the bulk box,
  // a binder — without changing the list. Targeted by copy id rather than entry
  // id: a rule-produced entry (ADR-034) has no `list_entries` row and so can't
  // be selected, but it still names a real copy that can move.
  const [moveToCollectionOpen, setMoveToCollectionOpen] = useState(false);
  const [moveCopyIds, setMoveCopyIds] = useState<string[]>([]);
  const handleMoveCopyToCollection = (copyId: string) => {
    setMoveCopyIds(resolveCopyMoveTarget(entries, selected, copyId));
    setMoveToCollectionOpen(true);
  };

  // Drop any in-progress selection when the list changes, and force browse
  // mode in the catalog (library) view where most tiles have no entry to act
  // on. Mirrors the collection grid's resets.
  useScopeEffect(listId, () => resetSelection());
  useScopeEffect(showLibrary, (library) => {
    if (library) {
      resetSelection();
    }
  });

  const bulkAddEntries = useBulkAddListEntries();
  const updateEntryMutation = useUpdateListEntry();

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
  // Mirrors BrowserCardViewer again: an entry removed under the open detail
  // view has to move the pane along with the highlight, not strand it on the
  // entry that just left.
  useEffect(() => {
    useSelectionStore.getState().reconcileSelection(items);
  }, [items]);
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

  const handleIncrement = (
    printing: Printing,
    _modifiers?: CardRowClickModifiers,
    quantity = 1,
  ) => {
    // Lists upsert by (listId, cardId|printingId) — adding the same key twice
    // bumps quantity. The server's bulk endpoint handles "new entry" vs.
    // "+n to existing entry" uniformly, and the hook's onMutate writes the
    // optimistic bump straight into the query cache. Anything above 1 comes
    // from the grid's digit-key shortcut.
    const bump = Math.max(1, quantity);
    const entryShape =
      kind === "card"
        ? { cardId: printing.cardId, quantity: bump }
        : { printingId: printing.id, quantity: bump };
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
  const enterSelectMode = () => setSelectMode(true);
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  // Select all covers the tiles currently on screen, minus rule-produced
  // entries (ADR-034) which have no row to act on. Same contract as the
  // collection grid's filtered `selectableCopyIds`.
  const selectableIds = selectableEntryIds(items, entryByItemId);
  const selectAll = () => toggleSelectAll(selectableIds);
  const isAllSelected = selectableIds.length > 0 && selected.size === selectableIds.length;

  // Shift-click range select: every entry between the last-clicked tile and
  // this one, in display order. One tile = one entry, so no stack expansion.
  const shiftSelectRange = (itemId: string) => {
    const targetEntry = entryByItemId.get(itemId);
    if (!targetEntry) {
      return;
    }
    const rangeIds = computeShiftRange({
      items,
      lastSelectedItemId: getLastSelectedItemId(),
      itemId,
      idsForItem: (rangeItem) => {
        // Rule-derived entries (null id, ADR-034) aren't selectable.
        const rangeEntry = entryByItemId.get(rangeItem.id);
        return rangeEntry && rangeEntry.id !== null ? [rangeEntry.id] : [];
      },
    });
    if (rangeIds === null) {
      // Rule-derived entries (null id, ADR-034) aren't selectable.
      if (targetEntry.id !== null) {
        toggleSelect(targetEntry.id);
        setLastSelectedItemId(itemId);
      }
      return;
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

  useRowActionHandlers("list", {
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
    onMoveCopyToCollection: handleMoveCopyToCollection,
    onExcludeFromRule: handleExcludeFromRule,
    isQuantityPendingFor: (entryId) => isQuantityPendingFor(entryId),
  });

  // Move targets: same kind + intent (the API rejects mismatches), this list
  // excluded.
  const moveTargetLists = allLists.filter(
    (list) => list.id !== listId && list.kind === kind && list.intent === intent,
  );

  return {
    mode,
    selected,
    clearSelection,
    enterSelectMode,
    exitSelectMode,
    selectAll,
    isAllSelected,
    hasSelectableEntries: selectableIds.length > 0,
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
  };
}
