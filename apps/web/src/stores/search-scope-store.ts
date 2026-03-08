import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, DEFAULT_SEARCH_SCOPE } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SearchScopeState {
  scope: SearchField[];
  toggleField: (field: SearchField) => void;
}

export const useSearchScopeStore = create<SearchScopeState>()(
  persist(
    (set) => ({
      scope: DEFAULT_SEARCH_SCOPE,
      toggleField: (field) =>
        set((state) => {
          const next = state.scope.includes(field)
            ? state.scope.filter((f) => f !== field)
            : [...state.scope, field];
          // Prevent empty scope
          if (next.length === 0) {
            return state;
          }
          return { scope: next };
        }),
    }),
    {
      name: "openrift-search-scope",
      partialize: (state) => ({ scope: state.scope }),
      merge: (persisted, current) => {
        const raw = (persisted as Partial<SearchScopeState>)?.scope;
        if (!Array.isArray(raw)) {
          return current;
        }
        const valid = raw.filter((f): f is SearchField =>
          ALL_SEARCH_FIELDS.includes(f as SearchField),
        );
        return {
          ...current,
          scope: valid.length > 0 ? valid : DEFAULT_SEARCH_SCOPE,
        };
      },
    },
  ),
);
