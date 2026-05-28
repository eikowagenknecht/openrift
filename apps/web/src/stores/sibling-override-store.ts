import { create } from "zustand";

/**
 * The three card-browser surfaces that support cards-view sibling swap.
 * Scoped so /cards, /collections and /lists don't bleed overrides into each
 * other when the user switches pages mid-session.
 */
type SiblingOverrideScope = "cards" | "collection" | "list";

interface SiblingOverrideState {
  overrides: Record<SiblingOverrideScope, Map<string, string>>;
  setOverride: (scope: SiblingOverrideScope, cardId: string, printingId: string) => void;
  clearScope: (scope: SiblingOverrideScope) => void;
}

/**
 * Per-cell sibling-swap state lifted out of every card-browser parent.
 *
 * The parent used to hold `topPrintingOverrides` as React state, which meant a
 * single sibling click invalidated the parent's `.map()` closure and forced
 * every visible cell to re-render. With per-cardId selectors against this
 * store, only the cell whose override changed re-renders.
 */
export const useSiblingOverrideStore = create<SiblingOverrideState>()((set) => ({
  overrides: { cards: new Map(), collection: new Map(), list: new Map() },
  setOverride: (scope, cardId, printingId) =>
    set((state) => ({
      overrides: {
        ...state.overrides,
        [scope]: new Map(state.overrides[scope]).set(cardId, printingId),
      },
    })),
  clearScope: (scope) =>
    set((state) => ({
      overrides: { ...state.overrides, [scope]: new Map() },
    })),
}));
