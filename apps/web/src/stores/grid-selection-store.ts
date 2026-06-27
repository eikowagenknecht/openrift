import { create } from "zustand";

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
 * Copy ids are client-generated and final (ADR-027 step 2), so optimistic
 * rows are selectable like any other: a move/dispose that races a still
 * in-flight add merely fails with a toast instead of corrupting anything.
 */
export const useGridSelectionStore = create<GridSelectionState>()((set) => ({
  selected: new Set(),
  toggleSelect: (copyId) => {
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
    if (copyIds.length === 0) {
      return;
    }
    set((state) => {
      const next = new Set(state.selected);
      const allSelected = copyIds.every((id) => next.has(id));
      for (const id of copyIds) {
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
    set((state) => {
      if (state.selected.size === allCopyIds.length) {
        return { selected: new Set() };
      }
      return { selected: new Set(allCopyIds) };
    });
  },
  addToSelection: (ids) => {
    if (ids.length === 0) {
      return;
    }
    set((state) => {
      const next = new Set(state.selected);
      for (const id of ids) {
        next.add(id);
      }
      return { selected: next };
    });
  },
  clearSelection: () => set({ selected: new Set() }),
}));
