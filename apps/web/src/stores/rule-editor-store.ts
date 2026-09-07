import type { ListKind } from "@openrift/shared/types/api/list";
import type {
  ListRule,
  ListRuleCombine,
  RuleQuantity,
  TradeKeepPer,
} from "@openrift/shared/types/list-rule";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { CardFilters } from "@openrift/shared/types/search";
import { create } from "zustand";

import type { DraftRule } from "@/lib/rule-draft";
import { draftFromRule, emptyDraft, serializeRules } from "@/lib/rule-draft";

export interface RuleEditorState {
  rules: DraftRule[];
  ruleCombine: ListRuleCombine | null;

  load: (rules: ListRule[], ruleCombine?: ListRuleCombine | null) => void;
  setRuleCombine: (ruleCombine: ListRuleCombine | null) => void;
  addRule: (languages?: string[]) => void;
  addDrafts: (drafts: DraftRule[]) => void;
  removeRule: (index: number) => void;
  setFilter: (index: number, filter: CardFilters) => void;
  setPriceMarketplace: (index: number, priceMarketplace: Marketplace | null) => void;
  setQuantity: (index: number, quantity: RuleQuantity) => void;
  setKeepPerCard: (index: number, keepPerCard: RuleQuantity) => void;
  setKeepPer: (index: number, keepPer: TradeKeepPer) => void;
  setNetOwned: (index: number, netOwned: boolean) => void;
  setCountSpecialVersions: (index: number, countSpecialVersions: boolean) => void;
  setCollectionIds: (index: number, collectionIds: string[] | null) => void;
  toggleExcludeId: (index: number, id: string) => void;
  toggleExcludeCopyId: (index: number, copyId: string) => void;
  reset: () => void;
  buildRules: (kind: ListKind) => ListRule[];
}

function patchRule(
  rules: DraftRule[],
  index: number,
  update: (rule: DraftRule) => DraftRule,
): DraftRule[] {
  return rules.map((rule, i) => (i === index ? update(rule) : rule));
}

export const useRuleEditorStore = create<RuleEditorState>()((set, get) => ({
  rules: [],
  ruleCombine: null,

  load: (rules, ruleCombine = null) =>
    set({ rules: rules.map((rule) => draftFromRule(rule)), ruleCombine }),

  setRuleCombine: (ruleCombine) => set({ ruleCombine }),

  addRule: (languages) => set((state) => ({ rules: [...state.rules, emptyDraft(languages)] })),

  addDrafts: (drafts) => set((state) => ({ rules: [...state.rules, ...drafts] })),

  removeRule: (index) => set((state) => ({ rules: state.rules.filter((_, i) => i !== index) })),

  setFilter: (index, filter) =>
    set((state) => ({ rules: patchRule(state.rules, index, (rule) => ({ ...rule, filter })) })),

  setPriceMarketplace: (index, priceMarketplace) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, priceMarketplace })),
    })),

  setQuantity: (index, quantity) =>
    set((state) => ({ rules: patchRule(state.rules, index, (rule) => ({ ...rule, quantity })) })),

  setKeepPerCard: (index, keepPerCard) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, keepPerCard })),
    })),

  setKeepPer: (index, keepPer) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, keepPer })),
    })),

  setNetOwned: (index, netOwned) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, netOwned })),
    })),

  setCountSpecialVersions: (index, countSpecialVersions) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, countSpecialVersions })),
    })),

  setCollectionIds: (index, collectionIds) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, collectionIds })),
    })),

  toggleExcludeId: (index, id) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({
        ...rule,
        excludeIds: rule.excludeIds.includes(id)
          ? rule.excludeIds.filter((existing) => existing !== id)
          : [...rule.excludeIds, id],
      })),
    })),

  toggleExcludeCopyId: (index, copyId) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({
        ...rule,
        excludeCopyIds: rule.excludeCopyIds.includes(copyId)
          ? rule.excludeCopyIds.filter((existing) => existing !== copyId)
          : [...rule.excludeCopyIds, copyId],
      })),
    })),

  reset: () => set({ rules: [], ruleCombine: null }),

  buildRules: (kind) => serializeRules(get().rules, kind),
}));
