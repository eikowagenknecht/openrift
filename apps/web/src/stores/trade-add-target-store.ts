import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A collection the viewer picked as the landing place for incoming trade copies. */
export interface TradeAddTarget {
  id: string;
  name: string;
}

function parseTarget(value: unknown): TradeAddTarget | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id === "string" && typeof raw.name === "string") {
    return { id: raw.id, name: raw.name };
  }
  return null;
}

interface TradeAddTargetState {
  /**
   * Where the Trades page's one-press add files incoming copies, remembered
   * across visits. `null` means the inbox, which is where every viewer starts.
   * The name rides along so the button can label itself on first paint, before
   * the collections query has resolved.
   */
  target: TradeAddTarget | null;
  setTarget: (value: TradeAddTarget | null) => void;
}

export const useTradeAddTargetStore = create<TradeAddTargetState>()(
  persist(
    (set) => ({
      target: null,
      setTarget: (value) => set({ target: value }),
    }),
    {
      name: "openrift-trade-add-target",
      partialize: (state) => ({ target: state.target }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        return { ...current, target: parseTarget(raw.target) };
      },
    },
  ),
);
