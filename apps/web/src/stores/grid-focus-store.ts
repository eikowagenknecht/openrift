import { create } from "zustand";

interface GridFocusState {
  /**
   * Item id of the card the detail pane currently has open, projected onto
   * the visible grid items (some surfaces key items by copyId or printingId).
   * `null` means no card is focused.
   */
  selectedItemId: string | null;
  /**
   * Item id of the card that should briefly flash after navigation — set when
   * `selectedItemId` changes, cleared by a timer in `CardGrid`. Lives next to
   * `selectedItemId` so cells can subscribe to it with the same selector shape.
   */
  flashCardId: string | null;
  setSelectedItemId: (id: string | null) => void;
  setFlashCardId: (id: string | null) => void;
}

/**
 * Card-browser focus state lifted out of `CardGrid`'s local useState so
 * per-cell components can subscribe with granular selectors.
 *
 * Without this store, every cell in the grid received `isSelected` /
 * `isFlashing` flags via a constructed `ctx` object inside
 * `CardRowContent`'s `.map()` callback. React Compiler can't memoize
 * expressions inside dynamic map callbacks, so the ctx object was new on
 * every parent render — busting the per-cell memo even when nothing about
 * a given cell changed.
 *
 * With this store, cells run `useGridFocusStore((s) => s.selectedItemId === itemId)`
 * per cell. Selectors return identity-equal booleans for every cell except
 * the one whose match flipped, so only that one re-renders.
 */
export const useGridFocusStore = create<GridFocusState>()((set) => ({
  selectedItemId: null,
  flashCardId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  setFlashCardId: (id) => set({ flashCardId: id }),
}));
