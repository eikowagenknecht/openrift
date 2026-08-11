import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * How many copies of each reserved trade actually changed hands, counted while
 * the cards are in front of you and before anything is settled.
 *
 * Keyed by trade id, and deliberately sparse: a trade with no entry has not
 * been touched, which the sheet reads as "all of it", so the common case of
 * everything turning up needs no writes at all. A count of 0 is a real answer
 * ("they forgot this one") and is stored.
 */
type TallyByTradeId = Record<string, number>;

/** @returns The persisted counts, dropping anything that is not a count. */
function parseCounts(value: unknown): TallyByTradeId {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const counts: TallyByTradeId = {};
  for (const [tradeId, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
      counts[tradeId] = count;
    }
  }
  return counts;
}

interface TradeTallyState {
  counts: TallyByTradeId;
  /** Records how many of `tradeId` turned up. */
  setCount: (tradeId: string, count: number) => void;
  /** Forgets a trade's count, putting it back to "all of it". */
  clearCount: (tradeId: string) => void;
  /** Forgets the given trades, which is what settling them does. */
  clearCounts: (tradeIds: readonly string[]) => void;
}

/**
 * The at-the-table tally, persisted so backing out of the sheet or reloading
 * mid-swap does not lose the count. It never reaches the server: settling is
 * what does that, and the whole point of counting first is that nothing is
 * written until the pile has been checked.
 */
export const useTradeTallyStore = create<TradeTallyState>()(
  persist(
    (set) => ({
      counts: {},
      setCount: (tradeId, count) =>
        set((state) => ({ counts: { ...state.counts, [tradeId]: count } })),
      clearCount: (tradeId) =>
        set((state) => {
          const { [tradeId]: _removed, ...rest } = state.counts;
          return { counts: rest };
        }),
      clearCounts: (tradeIds) =>
        set((state) => {
          const dropped = new Set(tradeIds);
          return {
            counts: Object.fromEntries(
              Object.entries(state.counts).filter(([tradeId]) => !dropped.has(tradeId)),
            ),
          };
        }),
    }),
    {
      name: "openrift-trade-tally",
      partialize: (state) => ({ counts: state.counts }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        return { ...current, counts: parseCounts(raw.counts) };
      },
    },
  ),
);

/**
 * How many copies of a trade to settle: the tallied count, or the whole row
 * when it was never touched. Capped at the row's quantity, since a trade can
 * shrink under a stale tally (the other party settled part of it first).
 * @returns The count to settle, between 0 and `quantity`.
 */
export function talliedCount(counts: TallyByTradeId, tradeId: string, quantity: number): number {
  const tallied = counts[tradeId];
  if (tallied === undefined) {
    return quantity;
  }
  return Math.min(tallied, quantity);
}
