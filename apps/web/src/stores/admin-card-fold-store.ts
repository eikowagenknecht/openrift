import { create } from "zustand";

interface AdminCardFoldState {
  collapsedByCard: Record<string, Set<string>>;
  togglePrinting: (cardId: string, printingId: string) => void;
  expandPrinting: (cardId: string, printingId: string) => void;
  setCollapsedForCard: (cardId: string, collapsed: Set<string>) => void;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function getCollapsedPrintings(
  state: AdminCardFoldState,
  cardId: string,
): ReadonlySet<string> {
  return state.collapsedByCard[cardId] ?? EMPTY_SET;
}

export const useAdminCardFoldStore = create<AdminCardFoldState>()((set) => ({
  collapsedByCard: {},

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
}));
