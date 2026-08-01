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

/**
 * One rule's draft state. A demand rule (card/printing lists) uses `filter` +
 * `quantity` + `excludeIds`; a supply rule (copy lists) uses `filter` +
 * `keepPerCard` + `collectionIds` + `excludeCopyIds`. Both shapes are kept so a
 * row can switch context without losing data.
 */
export interface DraftRule {
  /** The predicate. Shared with the card browser's filter language. */
  filter: CardFilters;
  /**
   * The marketplace backing the filter's price range (each quotes its own
   * currency). null until the price criterion is used; serialization emits it
   * only while the filter actually carries a price bound.
   */
  priceMarketplace: Marketplace | null;
  /** Card/printing lists: desired quantity per matched card/printing. */
  quantity: RuleQuantity;
  /** Copy lists: copies held back per card/printing; the surplus lands on the list. */
  keepPerCard: RuleQuantity;
  /** Copy lists: what the keep count groups by (card pools all printings). */
  keepPer: TradeKeepPer;
  /** Copy lists: restrict the source collections; null = all owned. */
  collectionIds: string[] | null;
  /** Card/printing lists: card/printing ids to drop from the result. */
  excludeIds: string[];
  /** Copy lists: copy ids to always leave off. */
  excludeCopyIds: string[];
  /** Card/printing lists: subtract owned copies and keep only the shortfall (ADR-034). */
  netOwned: boolean;
  /** Card lists (with netOwned): owned special versions also fill the shortfall. */
  countSpecialVersions: boolean;
}

/**
 * Draft state for the dynamic list-rule editor (ADR-034). One list is edited at
 * a time; every list may carry several rules, combined per the list's mode.
 * `load` seeds the drafts from the list's saved rules + combine mode, the
 * setters mutate one rule by index, and `buildRules` serializes the drafts back
 * to {@link ListRule}s for the PATCH.
 */
export interface RuleEditorState {
  /** The list's draft rules. Empty = no dynamic rules. */
  rules: DraftRule[];
  /**
   * How several rules combine (ADR-034 amendment 2). null = the kind's default
   * (card/printing: sum, copy: protect).
   */
  ruleCombine: ListRuleCombine | null;

  load: (rules: ListRule[], ruleCombine?: ListRuleCombine | null) => void;
  setRuleCombine: (ruleCombine: ListRuleCombine | null) => void;
  /** Appends a fresh rule. `languages` seeds its language filter (the user's preferred languages). */
  addRule: (languages?: string[]) => void;
  /** Appends pre-built drafts (rule presets from `@/lib/rule-presets`). */
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
  /**
   * Serializes the drafts to {@link ListRule}s for the given list kind.
   * @returns The list's rules in storage shape.
   */
  buildRules: (kind: ListKind) => ListRule[];
}

const DEFAULT_QUANTITY: RuleQuantity = { mode: "fixed", n: 1 };
const DEFAULT_KEEP: RuleQuantity = { mode: "fixed", n: 0 };

/**
 * @returns A fresh draft rule with default mode math and an empty filter, its
 * language facet seeded from `languages` (the user's preferred languages; empty
 * = show all, matching the card browser).
 */
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

/** @returns The draft seeded from a saved rule (filling unused fields with defaults). */
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

/**
 * Serializes draft rules to {@link ListRule}s for the given list kind. Pure —
 * takes the rules explicitly so callers can pass a reactive value (the live
 * preview) rather than reaching into the store via `get()`, which the React
 * Compiler can't see as a dependency. The rule shape follows the list's kind,
 * not its intent, so this covers organize lists too (ADR-034 amendment 4).
 * @returns The list's rules in storage shape.
 */
export function serializeRules(rules: DraftRule[], kind: ListKind): ListRule[] {
  return rules.map((rule): ListRule => {
    // Only meaningful (and only schema-valid alongside a bound) while the
    // filter carries a price bound; an inert leftover marketplace is dropped.
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

/**
 * Replaces the rule at `index` with the result of `update`, leaving the rest of
 * the array untouched.
 * @returns The next rules array.
 */
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
