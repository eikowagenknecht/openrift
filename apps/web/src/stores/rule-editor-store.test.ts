import type { ListRule } from "@openrift/shared/types/list-rule";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftRule } from "@/lib/rule-draft";
import { serializeRules } from "@/lib/rule-draft";
import { createStoreResetter } from "@/test/store-helpers";

import { useRuleEditorStore } from "./rule-editor-store";

function draft(overrides: Partial<DraftRule> = {}): DraftRule {
  return {
    filter: EMPTY_CARD_FILTERS,
    priceMarketplace: null,
    quantity: { mode: "fixed", n: 1 },
    keepPerCard: { mode: "fixed", n: 0 },
    keepPer: "card",
    collectionIds: null,
    excludeIds: [],
    excludeCopyIds: [],
    netOwned: false,
    countSpecialVersions: false,
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
    expect(state.buildRules("card")).toEqual([]);
  });

  it("addRule appends a default draft; removeRule drops it", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    expect(useRuleEditorStore.getState().rules).toHaveLength(1);
    expect(useRuleEditorStore.getState().rules[0]?.filter).toEqual(EMPTY_CARD_FILTERS);
    useRuleEditorStore.getState().removeRule(0);
    expect(useRuleEditorStore.getState().rules).toEqual([]);
  });

  it("addDrafts appends the given drafts after the existing rules", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.addDrafts([
      draft({ quantity: { mode: "playset", multiplier: 1 }, netOwned: true }),
      draft({ keepPerCard: { mode: "fixed", n: 1 }, keepPer: "printing" }),
    ]);
    const rules = useRuleEditorStore.getState().rules;
    expect(rules).toHaveLength(3);
    expect(rules[1]?.quantity).toEqual({ mode: "playset", multiplier: 1 });
    expect(rules[1]?.netOwned).toBe(true);
    expect(rules[2]?.keepPer).toBe("printing");
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

  it("builds the demand shape for printing lists too", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.setQuantity(0, { mode: "fixed", n: 2 });
    expect(useRuleEditorStore.getState().buildRules("printing")[0]).toMatchObject({
      kind: "wish",
      quantity: { mode: "fixed", n: 2 },
    });
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

    const rules = useRuleEditorStore.getState().buildRules("card");
    expect(rules).toEqual([
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, isStandard: false },
        quantity: { mode: "playset", multiplier: 1 },
        excludeIds: ["card-1"],
        netOwned: false,
        countSpecialVersions: false,
      },
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
        quantity: { mode: "fixed", n: 2 },
        excludeIds: [],
        netOwned: true,
        countSpecialVersions: false,
      },
    ]);
  });

  it("builds a trade rule from the draft", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.setKeepPerCard(0, { mode: "playset", multiplier: 2 });
    store.setCollectionIds(0, ["col-1"]);

    expect(useRuleEditorStore.getState().buildRules("copy")).toEqual([
      {
        kind: "trade",
        filter: EMPTY_CARD_FILTERS,
        collectionIds: ["col-1"],
        keepPerCard: { mode: "playset", multiplier: 2 },
        keepPer: "card",
        excludeCopyIds: [],
      },
    ]);
  });

  it("round-trips keepPer on trade rules and defaults it to card", () => {
    const rule: ListRule = {
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      collectionIds: null,
      keepPerCard: { mode: "playset", multiplier: 1 },
      keepPer: "printing",
      excludeCopyIds: [],
    };
    useRuleEditorStore.getState().load([rule]);
    expect(useRuleEditorStore.getState().rules[0]?.keepPer).toBe("printing");
    expect(useRuleEditorStore.getState().buildRules("copy")[0]).toMatchObject({
      keepPer: "printing",
    });

    const { keepPer: _keepPer, ...legacy } = rule;
    useRuleEditorStore.getState().load([legacy as ListRule]);
    expect(useRuleEditorStore.getState().rules[0]?.keepPer).toBe("card");

    useRuleEditorStore.getState().addRule();
    useRuleEditorStore.getState().setKeepPer(1, "printing");
    const rules = useRuleEditorStore.getState().rules;
    expect(rules[0]?.keepPer).toBe("card");
    expect(rules[1]?.keepPer).toBe("printing");
  });

  it("toggleExcludeCopyId removes and re-adds a single copy on the targeted rule", () => {
    const tradeRule = (excludeCopyIds: string[]): ListRule => ({
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds,
    });
    useRuleEditorStore.getState().load([tradeRule(["copy-1", "copy-2"]), tradeRule(["copy-9"])]);

    useRuleEditorStore.getState().toggleExcludeCopyId(0, "copy-1");
    let rules = useRuleEditorStore.getState().rules;
    expect(rules[0]?.excludeCopyIds).toEqual(["copy-2"]);
    expect(rules[1]?.excludeCopyIds).toEqual(["copy-9"]);

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
    const built = useRuleEditorStore.getState().buildRules("card")[0];
    expect(built).toMatchObject({ kind: "wish", netOwned: true });
  });

  it("round-trips countSpecialVersions on wish rules", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: EMPTY_CARD_FILTERS,
        quantity: { mode: "playset", multiplier: 1 },
        excludeIds: [],
        netOwned: true,
        countSpecialVersions: true,
      },
    ];
    useRuleEditorStore.getState().load(rules);
    expect(useRuleEditorStore.getState().rules[0]?.countSpecialVersions).toBe(true);
    const built = useRuleEditorStore.getState().buildRules("card")[0];
    expect(built).toMatchObject({ kind: "wish", countSpecialVersions: true });
  });

  it("setCountSpecialVersions flips the flag on the targeted rule", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.addRule();
    store.setCountSpecialVersions(1, true);
    expect(useRuleEditorStore.getState().rules[0]?.countSpecialVersions).toBe(false);
    expect(useRuleEditorStore.getState().rules[1]?.countSpecialVersions).toBe(true);
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

  it("load seeds the combine mode and defaults it to null", () => {
    useRuleEditorStore.getState().load([], "count-sum");
    expect(useRuleEditorStore.getState().ruleCombine).toBe("count-sum");
    useRuleEditorStore.getState().load([]);
    expect(useRuleEditorStore.getState().ruleCombine).toBeNull();
  });

  it("setRuleCombine sets and clears the combine mode", () => {
    useRuleEditorStore.getState().setRuleCombine("max");
    expect(useRuleEditorStore.getState().ruleCombine).toBe("max");
    useRuleEditorStore.getState().setRuleCombine(null);
    expect(useRuleEditorStore.getState().ruleCombine).toBeNull();
  });

  it("reset empties a populated store", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.setFilter(0, { ...EMPTY_CARD_FILTERS, rarities: ["common"] });
    store.setRuleCombine("sum");
    expect(useRuleEditorStore.getState().rules).toHaveLength(1);
    useRuleEditorStore.getState().reset();
    expect(useRuleEditorStore.getState().rules).toEqual([]);
    expect(useRuleEditorStore.getState().ruleCombine).toBeNull();
  });

  it("serializeRules reflects the passed rules without touching the store", () => {
    const rules = [draft({ filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] } })];
    expect(serializeRules(rules, "card")).toEqual([
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
        netOwned: false,
        countSpecialVersions: false,
      },
    ]);
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

  it("setPriceMarketplace targets one rule and round-trips through load", () => {
    const store = useRuleEditorStore.getState();
    store.addRule();
    store.addRule();
    store.setPriceMarketplace(1, "cardmarket");
    expect(useRuleEditorStore.getState().rules[0]?.priceMarketplace).toBeNull();
    expect(useRuleEditorStore.getState().rules[1]?.priceMarketplace).toBe("cardmarket");

    useRuleEditorStore.getState().load([
      {
        kind: "wish",
        filter: { ...EMPTY_CARD_FILTERS, price: { min: 2, max: null } },
        priceMarketplace: "tcgplayer",
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
      },
    ]);
    expect(useRuleEditorStore.getState().rules[0]?.priceMarketplace).toBe("tcgplayer");
  });

  it("serializeRules emits priceMarketplace only while a price bound is set", () => {
    const bounded = draft({
      filter: { ...EMPTY_CARD_FILTERS, price: { min: null, max: 5 } },
      priceMarketplace: "cardmarket",
    });
    expect(serializeRules([bounded], "card")[0]?.priceMarketplace).toBe("cardmarket");
    expect(serializeRules([bounded], "copy")[0]?.priceMarketplace).toBe("cardmarket");

    const unbounded = draft({ priceMarketplace: "cardmarket" });
    expect(serializeRules([unbounded], "card")[0]?.priceMarketplace).toBeUndefined();
    expect(serializeRules([unbounded], "copy")[0]?.priceMarketplace).toBeUndefined();
  });
});
