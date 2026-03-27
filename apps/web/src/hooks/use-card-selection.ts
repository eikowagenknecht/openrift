import { useState } from "react";

interface UseCardSelectionResult {
  selected: Set<string>;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  clearSelection: () => void;
}

/**
 * Manages multi-select state for card copies.
 * @returns Selection state and toggle helpers.
 */
export function useCardSelection(): UseCardSelectionResult {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const clearSelection = () => setSelected(new Set());

  return { selected, toggleSelect, toggleStack, toggleSelectAll, clearSelection };
}
