import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Keyed by trade id and deliberately sparse: no entry means "all of it
 * turned up". A count of 0 is a real answer and is stored.
 */
type TallyByTradeId = Record<string, number>;

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
  setCount: (tradeId: string, count: number) => void;
  clearCount: (tradeId: string) => void;
  clearCounts: (tradeIds: readonly string[]) => void;
}

/** Persisted so backing out of the sheet or reloading mid-swap keeps the count. */
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

/** Capped at `quantity`, since a trade can shrink under a stale tally. */
export function talliedCount(counts: TallyByTradeId, tradeId: string, quantity: number): number {
  const tallied = counts[tradeId];
  if (tallied === undefined) {
    return quantity;
  }
  return Math.min(tallied, quantity);
}
