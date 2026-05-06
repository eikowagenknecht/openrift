import type { RuleKind } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RulesShowChangesState {
  byKind: Record<RuleKind, boolean>;
  setShow: (kind: RuleKind, show: boolean) => void;
  reset: () => void;
}

const DEFAULTS: Record<RuleKind, boolean> = { core: false, tournament: false };

export const useRulesShowChangesStore = create<RulesShowChangesState>()(
  persist(
    (set) => ({
      byKind: DEFAULTS,
      setShow: (kind, show) => set((state) => ({ byKind: { ...state.byKind, [kind]: show } })),
      reset: () => set({ byKind: DEFAULTS }),
    }),
    {
      name: "openrift-rules-show-changes",
      partialize: (state) => ({ byKind: state.byKind }),
      merge: (persisted, current) => {
        const raw = persisted as { byKind?: Partial<Record<RuleKind, unknown>> } | undefined;
        const persistedByKind = raw?.byKind ?? {};
        return {
          ...current,
          byKind: {
            core:
              typeof persistedByKind.core === "boolean"
                ? persistedByKind.core
                : current.byKind.core,
            tournament:
              typeof persistedByKind.tournament === "boolean"
                ? persistedByKind.tournament
                : current.byKind.tournament,
          },
        };
      },
    },
  ),
);
