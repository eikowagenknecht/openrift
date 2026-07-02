import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import type { ListRule } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import type { DraftRule } from "./rule-editor-store";
import { serializeRules, useRuleEditorStore } from "./rule-editor-store";

/** @returns A draft rule with default math and an overridable filter. */
function draft(overrides: Partial<DraftRule> = {}): DraftRule {
  return {
    filter: EMPTY_CARD_FILTERS,
    quantity: { mode: "fixed", n: 1 },
    keepPerCard: { mode: "fixed", n: 0 },
    collectionIds: null,
    excludeIds: [],
    excludeCopyIds: [],
    netOwned: false,
    ...overrides,
  };
}

const resetStore = createStoreResetter(useRuleEditorStore);

beforeEach(resetStore);
afterEach(resetStore);

describe("useRuleEditorStore", () => {
  it("starts with no rules", () => {
    const state = useRuleEditorStore.getState();
    expect(state.rules).toEqual([]);
    expect(state.buildRules("wish")).toEqual([]);
  });

  it("addRule appends a default draft; removeRule drops it", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    expect(useRuleEditorStore.getState().rules).toHaveLength(1);
    expect(useRuleEditorStore.getState().rules[0]?.filter).toEqual(EMPTY_CARD_FILTERS);
    useRuleEditorStore.getState().removeRule(0);
    expect(useRuleEditorStore.getState().rules).toEqual([]);
  });

  it("addRule seeds the language filter from the given languages", () => {
    useRuleEditorStore.getState().addRule(["DE", "EN"]);
    expect(useRuleEditorStore.getState().rules[0]?.filter).toEqual({
      ...EMPTY_CARD_FILTERS,
      languages: ["DE", "EN"],
    });
  });

  it("addRule leaves the language filter empty when no languages are given", () => {
    useRuleEditorStore.getState().addRule([]);
    expect(useRuleEditorStore.getState().rules[0]?.filter).toEqual(EMPTY_CARD_FILTERS);
    useRuleEditorStore.getState().addRule();
    expect(useRuleEditorStore.getState().rules[1]?.filter).toEqual(EMPTY_CARD_FILTERS);
  });

  it("buildRules returns an empty array for organize", () => {
    useRuleEditorStore.getState().addRule();
    expect(useRuleEditorStore.getState().buildRules("organize")).toEqual([]);
  });

  it("builds several wish rules from the drafts", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.addRule();
    store.setFilter(0, { ...EMPTY_CARD_FILTERS, isStandard: false });
    store.setQuantity(0, { mode: "playset", multiplier: 1 });
    store.toggleExcludeId(0, "card-1");
    store.setFilter(1, { ...EMPTY_CARD_FILTERS, rarities: ["common"] });
    store.setQuantity(1, { mode: "fixed", n: 2 });

    store.setNetOwned(1, true);

    const rules = useRuleEditorStore.getState().buildRules("wish");
    expect(rules).toEqual([
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, isStandard: false },
        quantity: { mode: "playset", multiplier: 1 },
        excludeIds: ["card-1"],
        netOwned: false,
      },
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
        quantity: { mode: "fixed", n: 2 },
        excludeIds: [],
        netOwned: true,
      },
    ]);
  });

  it("builds a trade rule from the draft", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.setKeepPerCard(0, { mode: "playset", multiplier: 2 });
    store.setCollectionIds(0, ["col-1"]);

    expect(useRuleEditorStore.getState().buildRules("trade")).toEqual([
      {
        kind: "trade",
        filter: EMPTY_CARD_FILTERS,
        collectionIds: ["col-1"],
        keepPerCard: { mode: "playset", multiplier: 2 },
        excludeCopyIds: [],
      },
    ]);
  });

  it("toggleExcludeCopyId removes and re-adds a single copy on the targeted rule", () => {
    // Copy exclusions only enter a draft via `load` (the saved rule); the dialog
    // then removes them one chip at a time via toggleExcludeCopyId.
    const tradeRule = (excludeCopyIds: string[]): ListRule => ({
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds,
    });
    useRuleEditorStore.getState().load([tradeRule(["copy-1", "copy-2"]), tradeRule(["copy-9"])]);

    // Removes just the targeted copy, leaving its siblings and the other rule intact.
    useRuleEditorStore.getState().toggleExcludeCopyId(0, "copy-1");
    let rules = useRuleEditorStore.getState().rules;
    expect(rules[0]?.excludeCopyIds).toEqual(["copy-2"]);
    expect(rules[1]?.excludeCopyIds).toEqual(["copy-9"]);

    // Toggling an absent copy re-adds it (mirrors toggleExcludeId).
    useRuleEditorStore.getState().toggleExcludeCopyId(0, "copy-1");
    rules = useRuleEditorStore.getState().rules;
    expect(rules[0]?.excludeCopyIds).toEqual(["copy-2", "copy-1"]);
  });

  it("load seeds drafts from saved wish rules", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, languages: ["EN"] },
        quantity: { mode: "fixed", n: 3 },
        excludeIds: ["card-x"],
      },
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, types: ["unit"] },
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
      },
    ];
    useRuleEditorStore.getState().load(rules);
    const state = useRuleEditorStore.getState();
    expect(state.rules).toHaveLength(2);
    expect(state.rules[0]?.filter.languages).toEqual(["EN"]);
    expect(state.rules[0]?.quantity).toEqual({ mode: "fixed", n: 3 });
    expect(state.rules[0]?.excludeIds).toEqual(["card-x"]);
    expect(state.rules[1]?.filter.types).toEqual(["unit"]);
  });

  it("round-trips netOwned on wish rules", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: EMPTY_CARD_FILTERS,
        quantity: { mode: "playset", multiplier: 1 },
        excludeIds: [],
        netOwned: true,
      },
    ];
    useRuleEditorStore.getState().load(rules);
    expect(useRuleEditorStore.getState().rules[0]?.netOwned).toBe(true);
    const built = useRuleEditorStore.getState().buildRules("wish")[0];
    expect(built).toMatchObject({ kind: "wish", netOwned: true });
  });

  it("defaults netOwned to false when a saved wish rule omits it", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: EMPTY_CARD_FILTERS,
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
      },
    ];
    useRuleEditorStore.getState().load(rules);
    expect(useRuleEditorStore.getState().rules[0]?.netOwned).toBe(false);
  });

  it("load seeds a draft from a saved trade rule", () => {
    const rule: ListRule = {
      kind: "trade",
      filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
      collectionIds: ["col-2"],
      keepPerCard: { mode: "fixed", n: 1 },
      excludeCopyIds: ["copy-1"],
    };
    useRuleEditorStore.getState().load([rule]);
    const state = useRuleEditorStore.getState();
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0]?.collectionIds).toEqual(["col-2"]);
    expect(state.rules[0]?.keepPerCard).toEqual({ mode: "fixed", n: 1 });
    expect(state.rules[0]?.excludeCopyIds).toEqual(["copy-1"]);
  });

  it("load([]) clears the drafts", () => {
    useRuleEditorStore.getState().addRule();
    useRuleEditorStore.getState().load([]);
    expect(useRuleEditorStore.getState().rules).toEqual([]);
  });

  it("reset empties a populated store", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.setFilter(0, { ...EMPTY_CARD_FILTERS, rarities: ["common"] });
    expect(useRuleEditorStore.getState().rules).toHaveLength(1);
    useRuleEditorStore.getState().reset();
    expect(useRuleEditorStore.getState().rules).toEqual([]);
  });

  it("serializeRules reflects the passed rules without touching the store", () => {
    // The live preview serializes from its reactive `rules` value rather than
    // the store's `buildRules` (which reads `get()`), so editing a filter is
    // picked up immediately. This guards that the pure helper stays pure.
    const rules = [draft({ filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] } })];
    expect(serializeRules(rules, "wish")).toEqual([
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
        netOwned: false,
      },
    ]);
    expect(serializeRules(rules, "organize")).toEqual([]);
    // The store stays empty — serializeRules read only its argument.
    expect(useRuleEditorStore.getState().rules).toEqual([]);
  });

  it("setters only touch the targeted rule", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.addRule();
    store.toggleExcludeId(1, "a");
    expect(useRuleEditorStore.getState().rules[0]?.excludeIds).toEqual([]);
    expect(useRuleEditorStore.getState().rules[1]?.excludeIds).toEqual(["a"]);
    useRuleEditorStore.getState().toggleExcludeId(1, "a");
    expect(useRuleEditorStore.getState().rules[1]?.excludeIds).toEqual([]);
  });
});
