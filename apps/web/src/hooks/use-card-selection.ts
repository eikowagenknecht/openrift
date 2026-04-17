import { useRef, useState } from "react";

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

  const toggleSelect = (copyId: string) => {
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
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = copyIds.every((id) => next.has(id));
      for (const id of copyIds) {
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
    if (selected.size === allCopyIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allCopyIds));
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    lastSelectedItemIdRef.current = null;
  };

  const addToSelection = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
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
