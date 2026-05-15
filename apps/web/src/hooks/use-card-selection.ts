import { useRef, useState } from "react";

import { isTempCopyId } from "@/lib/temp-copy-id";

interface UseCardSelectionResult {
  selected: Set<string>;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  clearSelection: () => void;
  /** Reads the item ID (not copyId) of the last explicitly selected item, for Shift+click range. Call from event handlers only — not safe to read during render. */
  getLastSelectedItemId: () => string | null;
  setLastSelectedItemId: (id: string) => void;
  /** Adds all given IDs to the selection without toggling. */
  addToSelection: (ids: string[]) => void;
}

/**
 * Manages multi-select state for card copies.
 * @returns Selection state and toggle helpers.
 */
export function useCardSelection(): UseCardSelectionResult {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelectedItemIdRef = useRef<string | null>(null);

  // Optimistic rows inserted by useBatchedAddCopies live in the grid with a
  // temp- prefixed id until the add API returns a server-assigned uuid. Those
  // rows must not enter the selection set: dispose/move would 400 on the API
  // (invalid uuid) or race with the in-flight add. Filtering at the hook
  // makes every callsite (click, shift-range, select-all, stack-toggle) safe
  // without sprinkling the same guard through the grid.

  const toggleSelect = (copyId: string) => {
    if (isTempCopyId(copyId)) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(copyId)) {
        next.delete(copyId);
      } else {
        next.add(copyId);
      }
      return next;
    });
  };

  const toggleStack = (copyIds: string[]) => {
    const realIds = copyIds.filter((id) => !isTempCopyId(id));
    if (realIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = realIds.every((id) => next.has(id));
      for (const id of realIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const toggleSelectAll = (allCopyIds: string[]) => {
    const realIds = allCopyIds.filter((id) => !isTempCopyId(id));
    if (selected.size === realIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(realIds));
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    lastSelectedItemIdRef.current = null;
  };

  const addToSelection = (ids: string[]) => {
    const realIds = ids.filter((id) => !isTempCopyId(id));
    if (realIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of realIds) {
        next.add(id);
      }
      return next;
    });
  };

  const setLastSelectedItemId = (id: string) => {
    lastSelectedItemIdRef.current = id;
  };

  const getLastSelectedItemId = () => lastSelectedItemIdRef.current;

  return {
    selected,
    toggleSelect,
    toggleStack,
    toggleSelectAll,
    clearSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
  };
}
