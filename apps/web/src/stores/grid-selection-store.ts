import { create } from "zustand";

import { isTempCopyId } from "@/lib/temp-copy-id";

interface GridSelectionState {
  selected: Set<string>;
  selectMode: boolean;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  addToSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setSelectMode: (on: boolean) => void;
  // Used on scope change: a copy selected in the previous scope isn't in the
  // new grid, so the float bar would otherwise act on rows nobody can see.
  resetSelection: () => void;
}

// Optimistic rows from useBatchedAddCopies carry a temp- id until the add API
// returns a server uuid; toggle/add filter those out so dispose/move never 400s.
export const useGridSelectionStore = create<GridSelectionState>()((set) => ({
  selected: new Set(),
  selectMode: false,
  toggleSelect: (copyId) => {
    if (isTempCopyId(copyId)) {
      return;
    }
    set((state) => {
      const next = new Set(state.selected);
      if (next.has(copyId)) {
        next.delete(copyId);
      } else {
        next.add(copyId);
      }
      return { selected: next };
    });
  },
  toggleStack: (copyIds) => {
    const realIds = copyIds.filter((id) => !isTempCopyId(id));
    if (realIds.length === 0) {
      return;
    }
    set((state) => {
      const next = new Set(state.selected);
      const allSelected = realIds.every((id) => next.has(id));
      for (const id of realIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return { selected: next };
    });
  },
  toggleSelectAll: (allCopyIds) => {
    const realIds = allCopyIds.filter((id) => !isTempCopyId(id));
    set((state) => {
      if (state.selected.size === realIds.length) {
        return { selected: new Set() };
      }
      return { selected: new Set(realIds) };
    });
  },
  addToSelection: (ids) => {
    const realIds = ids.filter((id) => !isTempCopyId(id));
    if (realIds.length === 0) {
      return;
    }
    set((state) => {
      const next = new Set(state.selected);
      for (const id of realIds) {
        next.add(id);
      }
      return { selected: next };
    });
  },
  clearSelection: () => set({ selected: new Set() }),
  setSelectMode: (on) => set({ selectMode: on }),
  resetSelection: () => set({ selected: new Set(), selectMode: false }),
}));
