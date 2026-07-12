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
 * Holding `topPrintingOverrides` as parent React state would make a single
 * sibling click invalidate the parent's `.map()` closure and force every
 * visible cell to re-render. With per-cardId selectors against this store,
 * only the cell whose override changed re-renders.
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
