import type {
  CardFilters,
  ListKind,
  ListRule,
  ListRuleCombine,
  Marketplace,
  RuleQuantity,
  TradeKeepPer,
} from "@openrift/shared";
import { EMPTY_CARD_FILTERS, ruleKindForListKind } from "@openrift/shared";
import { create } from "zustand";

export interface DraftRule {
  filter: CardFilters;
  priceMarketplace: Marketplace | null;
  quantity: RuleQuantity;
  keepPerCard: RuleQuantity;
  keepPer: TradeKeepPer;
  collectionIds: string[] | null;
  excludeIds: string[];
  excludeCopyIds: string[];
  netOwned: boolean;
  countSpecialVersions: boolean;
}

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

const DEFAULT_QUANTITY: RuleQuantity = { mode: "fixed", n: 1 };
const DEFAULT_KEEP: RuleQuantity = { mode: "fixed", n: 0 };

export function emptyDraft(languages: string[] = []): DraftRule {
  return {
    filter: languages.length > 0 ? { ...EMPTY_CARD_FILTERS, languages } : EMPTY_CARD_FILTERS,
    priceMarketplace: null,
    quantity: DEFAULT_QUANTITY,
    keepPerCard: DEFAULT_KEEP,
    keepPer: "card",
    collectionIds: null,
    excludeIds: [],
    excludeCopyIds: [],
    netOwned: false,
    countSpecialVersions: false,
  };
}

function draftFromRule(rule: ListRule): DraftRule {
  if (rule.kind === "wish") {
    return {
      ...emptyDraft(),
      filter: rule.filter,
      priceMarketplace: rule.priceMarketplace ?? null,
      quantity: rule.quantity,
      excludeIds: rule.excludeIds,
      netOwned: rule.netOwned ?? false,
      countSpecialVersions: rule.countSpecialVersions ?? false,
    };
  }
  return {
    ...emptyDraft(),
    filter: rule.filter,
    priceMarketplace: rule.priceMarketplace ?? null,
    keepPerCard: rule.keepPerCard,
    keepPer: rule.keepPer ?? "card",
    collectionIds: rule.collectionIds,
    excludeCopyIds: rule.excludeCopyIds,
  };
}

/** Takes `rules` explicitly so a reactive caller stays trackable by the React Compiler. */
export function serializeRules(rules: DraftRule[], kind: ListKind): ListRule[] {
  return rules.map((rule): ListRule => {
    // A price marketplace is schema-valid only alongside a price bound.
    const priceBound = rule.filter.price.min !== null || rule.filter.price.max !== null;
    const priceMarketplace = priceBound ? (rule.priceMarketplace ?? undefined) : undefined;
    return ruleKindForListKind(kind) === "wish"
      ? {
          kind: "wish",
          filter: rule.filter,
          priceMarketplace,
          quantity: rule.quantity,
          excludeIds: rule.excludeIds,
          netOwned: rule.netOwned,
          countSpecialVersions: rule.countSpecialVersions,
        }
      : {
          kind: "trade",
          filter: rule.filter,
          priceMarketplace,
          collectionIds: rule.collectionIds,
          keepPerCard: rule.keepPerCard,
          keepPer: rule.keepPer,
          excludeCopyIds: rule.excludeCopyIds,
        };
  });
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
