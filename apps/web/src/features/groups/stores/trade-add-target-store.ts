import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TradeAddTarget } from "@/features/groups/lib/trade-add-target";

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
  /** `null` means the inbox. Name rides along so the button can label itself before the query resolves. */
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
