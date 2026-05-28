import { create } from "zustand";

interface MatchVariantsFoldState {
  /** Composite `${counterpartyUserId}:${buyEntryId}` keys of tiles whose variant list is expanded. */
  expanded: Set<string>;
  toggle: (id: string) => void;
}

/**
 * Per-tile expand state for the friend-group matches panel. A card-level wish
 * that matches several printings of the same card collapses into one tile;
 * this store tracks which of those tiles have their variant rows revealed.
 *
 * Default is collapsed (absent from the set) so the panel scans as a clean list
 * of matching cards. Each tile subscribes only to its own key, so toggling one
 * tile doesn't re-render the others (the React Compiler + per-key selector
 * pattern documented in docs/contributing.md).
 */
export const useMatchVariantsFoldStore = create<MatchVariantsFoldState>()((set) => ({
  expanded: new Set(),

  toggle: (id) =>
    set((state) => {
      const next = new Set(state.expanded);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expanded: next };
    }),
}));
