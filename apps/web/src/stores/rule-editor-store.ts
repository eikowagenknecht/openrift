import type { CardFilters, ListIntent, ListRule, RuleQuantity } from "@openrift/shared";
import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import { create } from "zustand";

/**
 * One rule's draft state. A wish rule uses `filter` + `quantity` + `excludeIds`;
 * a trade rule uses `filter` + `keepPerCard` + `collectionIds` + `excludeCopyIds`.
 * Both shapes are kept so a row can switch intent context without losing data.
 */
export interface DraftRule {
  /** The predicate. Shared with the card browser's filter language. */
  filter: CardFilters;
  /** Wish lists: desired quantity per matched card/printing. */
  quantity: RuleQuantity;
  /** Trade lists: copies kept per card; the surplus is offered. */
  keepPerCard: RuleQuantity;
  /** Trade lists: restrict the source collections; null = all owned. */
  collectionIds: string[] | null;
  /** Wish lists: card/printing ids to drop from the result. */
  excludeIds: string[];
  /** Trade lists: copy ids to never offer. */
  excludeCopyIds: string[];
  /** Wish lists: subtract owned copies and want only the shortfall (ADR-034). */
  netOwned: boolean;
}

/**
 * Draft state for the dynamic list-rule editor (ADR-034). One list is edited at
 * a time. A wish list may carry several rules; a trade list at most one (the
 * route layer enforces the cap). `load` seeds the drafts from the list's saved
 * rules, the setters mutate one rule by index, and `buildRules` serializes the
 * drafts back to {@link ListRule}s for the PATCH.
 */
export interface RuleEditorState {
  /** The list's draft rules. Empty = no dynamic rules. */
  rules: DraftRule[];

  load: (rules: ListRule[]) => void;
  /** Appends a fresh rule. `languages` seeds its language filter (the user's preferred languages). */
  addRule: (languages?: string[]) => void;
  removeRule: (index: number) => void;
  setFilter: (index: number, filter: CardFilters) => void;
  setQuantity: (index: number, quantity: RuleQuantity) => void;
  setKeepPerCard: (index: number, keepPerCard: RuleQuantity) => void;
  setNetOwned: (index: number, netOwned: boolean) => void;
  setCollectionIds: (index: number, collectionIds: string[] | null) => void;
  toggleExcludeId: (index: number, id: string) => void;
  toggleExcludeCopyId: (index: number, copyId: string) => void;
  reset: () => void;
  /**
   * Serializes the drafts to {@link ListRule}s for the given intent. Returns an
   * empty array for `organize` (never rule-able).
   * @returns The list's rules in storage shape.
   */
  buildRules: (intent: ListIntent) => ListRule[];
}

const DEFAULT_QUANTITY: RuleQuantity = { mode: "fixed", n: 1 };
const DEFAULT_KEEP: RuleQuantity = { mode: "fixed", n: 0 };

/**
 * @returns A fresh draft rule with default mode math and an empty filter, its
 * language facet seeded from `languages` (the user's preferred languages; empty
 * = show all, matching the card browser).
 */
function emptyDraft(languages: string[] = []): DraftRule {
  return {
    filter: languages.length > 0 ? { ...EMPTY_CARD_FILTERS, languages } : EMPTY_CARD_FILTERS,
    quantity: DEFAULT_QUANTITY,
    keepPerCard: DEFAULT_KEEP,
    collectionIds: null,
    excludeIds: [],
    excludeCopyIds: [],
    netOwned: false,
  };
}

/** @returns The draft seeded from a saved rule (filling unused fields with defaults). */
function draftFromRule(rule: ListRule): DraftRule {
  if (rule.kind === "wish") {
    return {
      ...emptyDraft(),
      filter: rule.filter,
      quantity: rule.quantity,
      excludeIds: rule.excludeIds,
      netOwned: rule.netOwned ?? false,
    };
  }
  return {
    ...emptyDraft(),
    filter: rule.filter,
    keepPerCard: rule.keepPerCard,
    collectionIds: rule.collectionIds,
    excludeCopyIds: rule.excludeCopyIds,
  };
}

/**
 * Serializes draft rules to {@link ListRule}s for the given intent. Pure — takes
 * the rules explicitly so callers can pass a reactive value (the live preview)
 * rather than reaching into the store via `get()`, which the React Compiler can't
 * see as a dependency. Returns an empty array for `organize` (never rule-able).
 * @returns The list's rules in storage shape.
 */
export function serializeRules(rules: DraftRule[], intent: ListIntent): ListRule[] {
  if (intent === "organize") {
    return [];
  }
  return rules.map(
    (rule): ListRule =>
      intent === "wish"
        ? {
            kind: "wish",
            filter: rule.filter,
            quantity: rule.quantity,
            excludeIds: rule.excludeIds,
            netOwned: rule.netOwned,
          }
        : {
            kind: "trade",
            filter: rule.filter,
            collectionIds: rule.collectionIds,
            keepPerCard: rule.keepPerCard,
            excludeCopyIds: rule.excludeCopyIds,
          },
  );
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

  load: (rules) => set({ rules: rules.map((rule) => draftFromRule(rule)) }),

  addRule: (languages) => set((state) => ({ rules: [...state.rules, emptyDraft(languages)] })),

  removeRule: (index) => set((state) => ({ rules: state.rules.filter((_, i) => i !== index) })),

  setFilter: (index, filter) =>
    set((state) => ({ rules: patchRule(state.rules, index, (rule) => ({ ...rule, filter })) })),

  setQuantity: (index, quantity) =>
    set((state) => ({ rules: patchRule(state.rules, index, (rule) => ({ ...rule, quantity })) })),

  setKeepPerCard: (index, keepPerCard) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, keepPerCard })),
    })),

  setNetOwned: (index, netOwned) =>
    set((state) => ({
      rules: patchRule(state.rules, index, (rule) => ({ ...rule, netOwned })),
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

  reset: () => set({ rules: [] }),

  buildRules: (intent) => serializeRules(get().rules, intent),
}));
