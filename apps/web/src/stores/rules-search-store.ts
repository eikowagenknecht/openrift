import { create } from "zustand";

interface RulesSearchState {
  query: string;
  // Increments every time the search is programmatically reset (e.g. an
  // anchor-link click that needs to reveal a hidden rule). The search bar
  // listens to this so it can clear its local draft state in addition to
  // the debounced query.
  resetSignal: number;
  setQuery: (query: string) => void;
  reset: () => void;
}

export const useRulesSearchStore = create<RulesSearchState>()((set) => ({
  query: "",
  resetSignal: 0,

  setQuery: (query) =>
    set((state) => {
      if (state.query === query) {
        return state;
      }
      return { query };
    }),

  reset: () =>
    set((state) => ({
      query: "",
      resetSignal: state.resetSignal + 1,
    })),
}));
