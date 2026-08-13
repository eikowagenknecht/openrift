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

/**
 * The card's stored fold set, or `undefined` when the card has not been seeded
 * yet. Callers distinguish the two: an unseeded card falls back to the default
 * (everything folded but the first printing), which is not the same as an
 * explicitly empty set (everything open after "Expand all").
 *
 * @returns The stored collapsed ids, or `undefined` when the card is unseeded.
 */
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
