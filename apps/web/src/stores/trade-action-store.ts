import type { CardTradeStatus } from "@openrift/shared";
import { create } from "zustand";

interface TradeActionState {
  /** Trade ids with an action in flight (used to disable their row buttons). */
  pending: Set<string>;
  /** Optimistic status overrides, keyed by trade id, until the mutation settles. */
  optimisticStatus: Map<string, CardTradeStatus>;
  /** Marks a trade's action in flight, optionally showing an optimistic status. */
  begin: (tradeId: string, optimistic?: CardTradeStatus) => void;
  /** Clears the in-flight + optimistic state once a mutation settles. */
  settle: (tradeId: string) => void;
}

/**
 * Per-trade optimistic/in-flight state for the Trades tab. Each row subscribes
 * only to its own trade id, so acting on one row doesn't re-render the others
 * (the React Compiler + per-key selector pattern, as in `rules-fold-store.ts`).
 *
 * Kept out of the trade list itself (which comes from TanStack Query) so the
 * parent `.map()` closure stays stable and the compiler can cache it.
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
