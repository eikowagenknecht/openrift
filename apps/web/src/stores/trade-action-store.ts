import type { CardTradeStatus } from "@openrift/shared/types/api/card-trade";
import { create } from "zustand";

interface TradeActionState {
  pending: Set<string>;
  optimisticStatus: Map<string, CardTradeStatus>;
  begin: (tradeId: string, optimistic?: CardTradeStatus) => void;
  settle: (tradeId: string) => void;
}

/**
 * Kept out of the TanStack Query trade list so the parent `.map()` closure
 * stays stable; each row subscribes only to its own trade id.
 */
export const useTradeActionStore = create<TradeActionState>()((set) => ({
  pending: new Set(),
  optimisticStatus: new Map(),

  begin: (tradeId, optimistic) =>
    set((state) => {
      const pending = new Set([...state.pending, tradeId]);
      if (optimistic === undefined) {
        return { pending };
      }
      const optimisticStatus = new Map([...state.optimisticStatus, [tradeId, optimistic] as const]);
      return { pending, optimisticStatus };
    }),

  settle: (tradeId) =>
    set((state) => {
      if (!state.pending.has(tradeId) && !state.optimisticStatus.has(tradeId)) {
        return state;
      }
      const pending = new Set(state.pending);
      pending.delete(tradeId);
      const optimisticStatus = new Map(state.optimisticStatus);
      optimisticStatus.delete(tradeId);
      return { pending, optimisticStatus };
    }),
}));
