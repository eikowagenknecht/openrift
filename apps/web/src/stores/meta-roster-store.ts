import { create } from "zustand";

// Which deck-roster rows are expanded (ADR-014's review screen, tier two).
//
// This is a store rather than parent state on purpose. The roster maps over its
// rows, and a `.map()` callback that closes over changing parent state cannot be
// cached by the React Compiler — every row would re-run on every expand. Each
// row subscribes to its own key instead, so the parent's callback closes over
// nothing that changes and only the toggled row re-renders.

interface MetaRosterState {
  /** Row keys currently expanded. Row keys come from `buildRosterRows`. */
  expandedRows: Set<string>;
  toggleRow: (rowKey: string) => void;
  collapseAll: () => void;
}

export const useMetaRosterStore = create<MetaRosterState>()((set) => ({
  expandedRows: new Set(),

  toggleRow: (rowKey) =>
    set((state) => {
      const next = new Set(state.expandedRows);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return { expandedRows: next };
    }),

  collapseAll: () =>
    set((state) => {
      if (state.expandedRows.size === 0) {
        return state;
      }
      return { expandedRows: new Set() };
    }),
}));

/**
 * One row's expansion, subscribed on its own so the rest of the roster does not
 * re-render when a neighbour opens.
 *
 * @param rowKey - The roster row's key.
 * @returns Whether that row is expanded.
 */
export function useMetaRosterRowExpanded(rowKey: string): boolean {
  return useMetaRosterStore((state) => state.expandedRows.has(rowKey));
}
