import { create } from "zustand";

type AdminCardSectionId = "cardFields" | "marketplace" | "printings";

interface AdminCardFoldState {
  collapsedByCard: Record<string, Set<string>>;
  collapsedSections: Set<AdminCardSectionId>;
  togglePrinting: (cardId: string, printingId: string) => void;
  expandPrinting: (cardId: string, printingId: string) => void;
  setCollapsedForCard: (cardId: string, collapsed: Set<string>) => void;
  initCollapsedForCard: (cardId: string, collapsed: Set<string>) => void;
  toggleSection: (sectionId: AdminCardSectionId) => void;
}

// `undefined` (unseeded, falls back to the default fold) is distinct from an
// explicitly empty set (everything open after "Expand all").
export function getStoredCollapsedPrintings(
  state: AdminCardFoldState,
  cardId: string,
): ReadonlySet<string> | undefined {
  return state.collapsedByCard[cardId];
}

export function getCollapsedSections(state: AdminCardFoldState): ReadonlySet<AdminCardSectionId> {
  return state.collapsedSections;
}

export const useAdminCardFoldStore = create<AdminCardFoldState>()((set) => ({
  collapsedByCard: {},
  collapsedSections: new Set(),

  togglePrinting: (cardId, printingId) =>
    set((state) => {
      const current = state.collapsedByCard[cardId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(printingId)) {
        next.delete(printingId);
      } else {
        next.add(printingId);
      }
      return { collapsedByCard: { ...state.collapsedByCard, [cardId]: next } };
    }),

  expandPrinting: (cardId, printingId) =>
    set((state) => {
      const current = state.collapsedByCard[cardId];
      if (!current || !current.has(printingId)) {
        return state;
      }
      const next = new Set(current);
      next.delete(printingId);
      return { collapsedByCard: { ...state.collapsedByCard, [cardId]: next } };
    }),

  setCollapsedForCard: (cardId, collapsed) =>
    set((state) => ({
      collapsedByCard: { ...state.collapsedByCard, [cardId]: new Set(collapsed) },
    })),

  // Seeds the card's default folds on first visit. A no-op afterwards, so a
  // refetch never re-folds rows the admin just opened.
  initCollapsedForCard: (cardId, collapsed) =>
    set((state) => {
      if (state.collapsedByCard[cardId]) {
        return state;
      }
      return { collapsedByCard: { ...state.collapsedByCard, [cardId]: new Set(collapsed) } };
    }),

  toggleSection: (sectionId) =>
    set((state) => {
      const next = new Set(state.collapsedSections);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return { collapsedSections: next };
    }),
}));
