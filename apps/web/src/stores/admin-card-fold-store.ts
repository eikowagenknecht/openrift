import { create } from "zustand";

type AdminCardSectionId = "cardFields" | "marketplace" | "printings";

interface AdminCardFoldState {
  collapsedByCard: Record<string, Set<string>>;
  collapsedSectionsByCard: Record<string, Set<AdminCardSectionId>>;
  togglePrinting: (cardId: string, printingId: string) => void;
  expandPrinting: (cardId: string, printingId: string) => void;
  setCollapsedForCard: (cardId: string, collapsed: Set<string>) => void;
  toggleSection: (cardId: string, sectionId: AdminCardSectionId) => void;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_SECTION_SET: ReadonlySet<AdminCardSectionId> = new Set();

export function getCollapsedPrintings(
  state: AdminCardFoldState,
  cardId: string,
): ReadonlySet<string> {
  return state.collapsedByCard[cardId] ?? EMPTY_SET;
}

export function getCollapsedSections(
  state: AdminCardFoldState,
  cardId: string,
): ReadonlySet<AdminCardSectionId> {
  return state.collapsedSectionsByCard[cardId] ?? EMPTY_SECTION_SET;
}

export const useAdminCardFoldStore = create<AdminCardFoldState>()((set) => ({
  collapsedByCard: {},
  collapsedSectionsByCard: {},

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

  toggleSection: (cardId, sectionId) =>
    set((state) => {
      const current = state.collapsedSectionsByCard[cardId] ?? new Set<AdminCardSectionId>();
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return {
        collapsedSectionsByCard: { ...state.collapsedSectionsByCard, [cardId]: next },
      };
    }),
}));
