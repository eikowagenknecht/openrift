import { useRef } from "react";

import { useGridSelectionStore } from "@/stores/grid-selection-store";

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
 * Thin wrapper around {@link useGridSelectionStore} that exposes the
 * historical hook interface and keeps `lastSelectedItemId` as a per-mount
 * ref. The selected set lives in a Zustand store so per-cell components can
 * subscribe to "am I selected?" without re-rendering when unrelated cells
 * flip.
 * @returns Selection state and toggle helpers.
 */
export function useCardSelection(): UseCardSelectionResult {
  const selected = useGridSelectionStore((s) => s.selected);
  // Zustand actions are referentially stable for the lifetime of the store,
  // so selecting them via per-field selectors never causes a re-render —
  // the equality check is `Object.is(prevFn, sameFn)` which is always true.
  const toggleSelect = useGridSelectionStore((s) => s.toggleSelect);
  const toggleStack = useGridSelectionStore((s) => s.toggleStack);
  const toggleSelectAll = useGridSelectionStore((s) => s.toggleSelectAll);
  const addToSelection = useGridSelectionStore((s) => s.addToSelection);
  const storeClearSelection = useGridSelectionStore((s) => s.clearSelection);
  const lastSelectedItemIdRef = useRef<string | null>(null);

  return {
    selected,
    toggleSelect,
    toggleStack,
    toggleSelectAll,
    clearSelection: () => {
      storeClearSelection();
      lastSelectedItemIdRef.current = null;
    },
    addToSelection,
    setLastSelectedItemId: (id) => {
      lastSelectedItemIdRef.current = id;
    },
    getLastSelectedItemId: () => lastSelectedItemIdRef.current,
  };
}
