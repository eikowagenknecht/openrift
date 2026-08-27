import { useRef } from "react";

import { useGridSelectionStore } from "@/stores/grid-selection-store";

interface UseCardSelectionResult {
  selected: Set<string>;
  /** Whether the grid is in multi-select mode rather than browse mode. */
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  clearSelection: () => void;
  /** Drops the selection and leaves select mode, for a scope change. */
  resetSelection: () => void;
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
  const selectMode = useGridSelectionStore((s) => s.selectMode);
  const setSelectMode = useGridSelectionStore((s) => s.setSelectMode);
  // Zustand actions are referentially stable for the lifetime of the store,
  // so selecting them via per-field selectors never causes a re-render —
  // the equality check is `Object.is(prevFn, sameFn)` which is always true.
  const toggleSelect = useGridSelectionStore((s) => s.toggleSelect);
  const toggleStack = useGridSelectionStore((s) => s.toggleStack);
  const toggleSelectAll = useGridSelectionStore((s) => s.toggleSelectAll);
  const addToSelection = useGridSelectionStore((s) => s.addToSelection);
  const storeClearSelection = useGridSelectionStore((s) => s.clearSelection);
  const storeResetSelection = useGridSelectionStore((s) => s.resetSelection);
  const lastSelectedItemIdRef = useRef<string | null>(null);

  return {
    selected,
    selectMode,
    setSelectMode,
    toggleSelect,
    toggleStack,
    toggleSelectAll,
    clearSelection: () => {
      storeClearSelection();
      lastSelectedItemIdRef.current = null;
    },
    resetSelection: () => {
      storeResetSelection();
      lastSelectedItemIdRef.current = null;
    },
    addToSelection,
    setLastSelectedItemId: (id) => {
      lastSelectedItemIdRef.current = id;
    },
    getLastSelectedItemId: () => lastSelectedItemIdRef.current,
  };
}
