import { create } from "zustand";

/**
 * Open state of the mobile filter/options drawer, published by
 * `MobileOptionsDrawer` so data hooks can skip work whose output is invisible
 * while the drawer is closed (the faceted filter counts are the expensive
 * case: on phones no chip surface shows them until the drawer opens).
 *
 * Like the grid-viewport store, these are viewport facts, not preferences —
 * they reset on navigation and mean nothing on the next visit.
 */
interface FilterDrawerState {
  /** Whether the mobile options drawer is currently open. */
  open: boolean;
  /**
   * Whether the drawer has been opened at least once this mount. Drives
   * `keepMounted`: after the first open the content stays mounted, so
   * reopening skips the full filter-panel mount.
   */
  openedOnce: boolean;
  setOpen: (open: boolean) => void;
}

export const useFilterDrawerStore = create<FilterDrawerState>()((set) => ({
  open: false,
  openedOnce: false,
  setOpen: (open) => set((state) => ({ open, openedOnce: state.openedOnce || open })),
}));
