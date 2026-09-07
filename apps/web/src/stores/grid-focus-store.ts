import { create } from "zustand";

interface GridFocusState {
  selectedItemId: string | null;
  flashCardId: string | null;
  setSelectedItemId: (id: string | null) => void;
  setFlashCardId: (id: string | null) => void;
}

// React Compiler can't memoize a ctx object built inside a .map() callback, so
// per-cell selectors here replace that object to avoid busting every cell's memo.
export const useGridFocusStore = create<GridFocusState>()((set) => ({
  selectedItemId: null,
  flashCardId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  setFlashCardId: (id) => set({ flashCardId: id }),
}));
