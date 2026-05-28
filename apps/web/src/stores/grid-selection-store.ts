import { create } from "zustand";

import { isTempCopyId } from "@/lib/temp-copy-id";

interface GridSelectionState {
  /** Selected copy IDs. */
  selected: Set<string>;
  toggleSelect: (copyId: string) => void;
  toggleStack: (copyIds: string[]) => void;
  toggleSelectAll: (allCopyIds: string[]) => void;
  addToSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

/**
 * Multi-select state for the /collections grid.
 *
 * Lifted into a Zustand store so per-cell components can subscribe to "am I
 * selected?" with a granular selector. The previous `useCardSelection` hook
 * stored the set in `useState`, which forced every cell in the grid to
 * re-render whenever the selection changed.
 *
 * Optimistic rows inserted by `useBatchedAddCopies` live in the grid with a
 * `temp-` prefixed id until the add API returns a server-assigned uuid. Those
 * rows must not enter the selection set: dispose/move would 400 on the API
 * (invalid uuid) or race with the in-flight add. Filtering at the store level
 * makes every callsite safe without sprinkling the same guard everywhere.
 */
export const useGridSelectionStore = create<GridSelectionState>()((set) => ({
  selected: new Set(),
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
}));
