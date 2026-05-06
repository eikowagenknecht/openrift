import { create } from "zustand";

interface RulesDiffExpandState {
  expandedRules: Set<string>;
  toggle: (ruleNumber: string) => void;
  reset: () => void;
}

export const useRulesDiffExpandStore = create<RulesDiffExpandState>()((set) => ({
  expandedRules: new Set(),
  toggle: (ruleNumber) =>
    set((state) => {
      const next = new Set(state.expandedRules);
      if (next.has(ruleNumber)) {
        next.delete(ruleNumber);
      } else {
        next.add(ruleNumber);
      }
      return { expandedRules: next };
    }),
  reset: () =>
    set((state) => {
      if (state.expandedRules.size === 0) {
        return state;
      }
      return { expandedRules: new Set() };
    }),
}));
