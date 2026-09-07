import { create } from "zustand";

/** Scoped so /cards, /collections and /lists don't bleed overrides into each other. */
type SiblingOverrideScope = "cards" | "collection" | "list";

interface SiblingOverrideState {
  overrides: Record<SiblingOverrideScope, Map<string, string>>;
  setOverride: (scope: SiblingOverrideScope, cardId: string, printingId: string) => void;
  clearScope: (scope: SiblingOverrideScope) => void;
}

/**
 * Lifted out of parent React state: a single sibling click would otherwise
 * invalidate the parent's `.map()` closure and re-render every visible cell.
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
