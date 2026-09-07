import { create } from "zustand";

interface MatchVariantsFoldState {
  /** `${counterpartyUserId}:${buyEntryId}` */
  expanded: Set<string>;
  toggle: (id: string) => void;
}

// Each tile subscribes only to its own key, so toggling one tile doesn't
// re-render the others (the per-key selector pattern, as in `rules-fold-store.ts`).
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
