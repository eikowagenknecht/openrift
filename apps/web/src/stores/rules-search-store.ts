import { create } from "zustand";

interface RulesSearchState {
  query: string;
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
