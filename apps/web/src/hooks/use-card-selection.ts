import { useRef } from "react";

import { useGridSelectionStore } from "@/stores/grid-selection-store";

interface UseCardSelectionResult {
  selected: Set<string>;
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  clearSelection: () => void;
  resetSelection: () => void;
  /** Not safe to call during render; reads a ref updated only from event handlers. */
  getLastSelectedItemId: () => string | null;
  setLastSelectedItemId: (id: string) => void;
  addToSelection: (ids: string[]) => void;
}

export function useCardSelection(): UseCardSelectionResult {
  const selected = useGridSelectionStore((s) => s.selected);
  const selectMode = useGridSelectionStore((s) => s.selectMode);
  const setSelectMode = useGridSelectionStore((s) => s.setSelectMode);
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
