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
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { resolveCopyMoveTarget, selectableEntryIds } from "@/lib/list-entries";
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
  rules: ListRule[];
  entries: ListEntryDetailResponse[];
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
  const [actionEntryIds, setActionEntryIds] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const { data: allLists } = useLists();
  const moveEntries = useMoveListEntries();
  const bulkRemove = useBulkRemoveListEntries();
  const updateList = useUpdateList();

  const handleExcludeFromRule = (target: RuleExcludeTarget) => {
    const next = excludeEntryFromRules(rules, target, allPrintings);
    if (!next) {
      return;
    }
    // No onError here: a per-call handler runs in addition to the global mutation
    // onError, which already toasts the server's message.
    updateList.mutate({ listId, rules: next });
  };

  // Take-off's sold outcome reuses the /collections dispose flow: it hard-deletes the
  // copies, cascading them off every list. `listId` is excluded from the warning list
  // so this list isn't named among the "other lists" the copies also sit on.
  const userId = useUserId();
  const queryClient = useQueryClient();
  const [takeOffOpen, setTakeOffOpen] = useState(false);
  const disposeCopies = useDisposeCopies();
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
  // Copies pinned to a live trade block the sold outcome: disposing one would break the trade.
  const reservedEntryIds = new Set(
    entries.flatMap((entry) => (entry.kind === "copy" && entry.reserved ? [entry.id] : [])),
  );
  const takeOffReservedCount = actionEntryIds.filter((id) => reservedEntryIds.has(id)).length;

  // Targeted by copy id: a rule-produced entry has no `list_entries` row and can't be
  // selected, but still names a real copy that can move.
  const [moveToCollectionOpen, setMoveToCollectionOpen] = useState(false);
  const [moveCopyIds, setMoveCopyIds] = useState<string[]>([]);
  const handleMoveCopyToCollection = (copyId: string) => {
    setMoveCopyIds(resolveCopyMoveTarget(entries, selected, copyId));
    setMoveToCollectionOpen(true);
  };

  useScopeEffect(listId, () => resetSelection());
  useScopeEffect(showLibrary, (library) => {
    if (library) {
      resetSelection();
    }
  });

  const bulkAddEntries = useBulkAddListEntries();
  const updateEntryMutation = useUpdateListEntry();

  // Grouped-by-set tiles are per (cardId, setId), so clicks navigate by printing, not card.
  const findBy: "card" | "printing" = view === "cards" && groupBy !== "set" ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
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
    // Lists upsert by (listId, cardId|printingId): adding the same key twice bumps
    // quantity server-side. Anything above 1 comes from the grid's digit-key shortcut.
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
    // Rule-derived entries (null id) can't be decremented.
    if (!entry || entry.id === null || entry.quantity <= 1) {
      return;
    }
    updateEntryMutation.mutate({ listId, entryId: entry.id, quantity: entry.quantity - 1 });
  };

  const enterSelectMode = () => setSelectMode(true);
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  const selectableIds = selectableEntryIds(items, entryByItemId);
  const selectAll = () => toggleSelectAll(selectableIds);
  const isAllSelected = selectableIds.length > 0 && selected.size === selectableIds.length;

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
        // Rule-derived entries (null id) aren't selectable.
        const rangeEntry = entryByItemId.get(rangeItem.id);
        return rangeEntry && rangeEntry.id !== null ? [rangeEntry.id] : [];
      },
    });
    if (rangeIds === null) {
      // Rule-derived entries (null id) aren't selectable.
      if (targetEntry.id !== null) {
        toggleSelect(targetEntry.id);
        setLastSelectedItemId(itemId);
      }
      return;
    }
    addToSelection(rangeIds);
    setLastSelectedItemId(itemId);
  };

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

  const handleTakeOffSold = () => {
    const count = takeOffCopyIds.length;
    disposeCopies.mutate(
      { copyIds: takeOffCopyIds },
      {
        onSuccess: () => {
          toast.success(`Marked ${count} card${count === 1 ? "" : "s"} as sold`);
          clearSelection();
          setTakeOffOpen(false);
          // Dispose cascades its list-entry deletes server-side; refetch to drop them from view.
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
    onItemClick: (itemId, printing, modifiers) => {
      if (mode === "browse") {
        handleCardClick(printing);
        return;
      }
      const entry = entryByItemId.get(itemId);
      // Rule-derived entries (null id) aren't selectable.
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
      // Rule-derived entries (null id) aren't selectable.
      if (!entry || entry.id === null) {
        return;
      }
      toggleSelect(entry.id);
      setLastSelectedItemId(itemId);
    },
    onListBulkAction: (entryId, action) => {
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
      // Defensive: the cell already disables the button when there's no entry.
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
