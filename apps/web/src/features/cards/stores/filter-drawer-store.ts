import { create } from "zustand";

// Published so data hooks can skip work invisible while the drawer is closed
// (faceted filter counts are the expensive case). Viewport facts, not
// preferences: reset on navigation, mean nothing on the next visit.
interface FilterDrawerState {
  open: boolean;
  openedOnce: boolean;
  setOpen: (open: boolean) => void;
}

export const useFilterDrawerStore = create<FilterDrawerState>()((set) => ({
  open: false,
  openedOnce: false,
  setOpen: (open) => set((state) => ({ open, openedOnce: state.openedOnce || open })),
}));
