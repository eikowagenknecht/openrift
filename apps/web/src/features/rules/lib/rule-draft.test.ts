import type { ListRule } from "@openrift/shared/types/list-rule";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import { describe, expect, it } from "vitest";

import { draftFromRule, emptyDraft, serializeRules } from "./rule-draft";

const PRICED_FILTER = { ...EMPTY_CARD_FILTERS, price: { min: 100, max: null } };

function wishRule(overrides: Partial<Extract<ListRule, { kind: "wish" }>> = {}): ListRule {
  return {
    kind: "wish",
    filter: EMPTY_CARD_FILTERS,
    quantity: { mode: "fixed", n: 4 },
    excludeIds: [],
    ...overrides,
  };
}

function tradeRule(overrides: Partial<Extract<ListRule, { kind: "trade" }>> = {}): ListRule {
  return {
    kind: "trade",
    filter: EMPTY_CARD_FILTERS,
    collectionIds: null,
    keepPerCard: { mode: "fixed", n: 3 },
    excludeCopyIds: [],
    ...overrides,
  };
}

describe("emptyDraft", () => {
  it("starts from the empty filter when no languages are given", () => {
    expect(emptyDraft().filter).toEqual(EMPTY_CARD_FILTERS);
  });

  it("preselects the given languages on the filter", () => {
    expect(emptyDraft(["EN", "DE"]).filter).toEqual({
      ...EMPTY_CARD_FILTERS,
      languages: ["EN", "DE"],
    });
  });

  it("leaves the filter untouched for an empty language list", () => {
    expect(emptyDraft([]).filter.languages).toEqual([]);
  });

  it("wants one copy and keeps none by default", () => {
    const draft = emptyDraft();
    expect(draft.quantity).toEqual({ mode: "fixed", n: 1 });
    expect(draft.keepPerCard).toEqual({ mode: "fixed", n: 0 });
    expect(draft.keepPer).toBe("card");
  });

  it("spans every collection and excludes nothing", () => {
    const draft = emptyDraft();
    expect(draft.collectionIds).toBeNull();
    expect(draft.excludeIds).toEqual([]);
    expect(draft.excludeCopyIds).toEqual([]);
  });

  it("leaves the net-owned and special-version toggles off", () => {
    const draft = emptyDraft();
    expect(draft.netOwned).toBe(false);
    expect(draft.countSpecialVersions).toBe(false);
    expect(draft.priceMarketplace).toBeNull();
  });
});

describe("draftFromRule", () => {
  it("carries a wish rule's own fields onto the draft", () => {
    const draft = draftFromRule(
      wishRule({
        filter: PRICED_FILTER,
        priceMarketplace: "cardmarket",
        quantity: { mode: "playset", multiplier: 2 },
        excludeIds: ["card-1"],
        netOwned: true,
        countSpecialVersions: true,
      }),
    );
    expect(draft).toMatchObject({
      filter: PRICED_FILTER,
      priceMarketplace: "cardmarket",
      quantity: { mode: "playset", multiplier: 2 },
      excludeIds: ["card-1"],
      netOwned: true,
      countSpecialVersions: true,
    });
  });

  it("fills a wish rule's absent optionals with the empty draft's defaults", () => {
    const draft = draftFromRule(wishRule());
    expect(draft.priceMarketplace).toBeNull();
    expect(draft.netOwned).toBe(false);
    expect(draft.countSpecialVersions).toBe(false);
  });

  it("leaves the trade-only fields at their defaults for a wish rule", () => {
    const draft = draftFromRule(wishRule({ excludeIds: ["card-1"] }));
    expect(draft.keepPerCard).toEqual({ mode: "fixed", n: 0 });
    expect(draft.keepPer).toBe("card");
    expect(draft.collectionIds).toBeNull();
    expect(draft.excludeCopyIds).toEqual([]);
  });

  it("carries a trade rule's own fields onto the draft", () => {
    const draft = draftFromRule(
      tradeRule({
        priceMarketplace: "tcgplayer",
        keepPerCard: { mode: "playset", multiplier: 1 },
        keepPer: "printing",
        collectionIds: ["collection-1"],
        excludeCopyIds: ["copy-1"],
      }),
    );
    expect(draft).toMatchObject({
      priceMarketplace: "tcgplayer",
      keepPerCard: { mode: "playset", multiplier: 1 },
      keepPer: "printing",
      collectionIds: ["collection-1"],
      excludeCopyIds: ["copy-1"],
    });
  });

  it("falls back to per-card keeping when a trade rule omits keepPer", () => {
    expect(draftFromRule(tradeRule()).keepPer).toBe("card");
  });

  it("leaves the wish-only fields at their defaults for a trade rule", () => {
    const draft = draftFromRule(tradeRule({ excludeCopyIds: ["copy-1"] }));
    expect(draft.quantity).toEqual({ mode: "fixed", n: 1 });
    expect(draft.excludeIds).toEqual([]);
    expect(draft.netOwned).toBe(false);
  });
});

describe("serializeRules", () => {
  it("returns nothing for no drafts", () => {
    expect(serializeRules([], "card")).toEqual([]);
  });

  it("writes wish rules for a card list", () => {
    const [rule] = serializeRules([emptyDraft()], "card");
    expect(rule).toEqual({
      kind: "wish",
      filter: EMPTY_CARD_FILTERS,
      priceMarketplace: undefined,
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
      netOwned: false,
      countSpecialVersions: false,
    });
  });

  it("writes wish rules for a printing list", () => {
    expect(serializeRules([emptyDraft()], "printing")[0]?.kind).toBe("wish");
  });

  it("writes trade rules for a copy list", () => {
    const [rule] = serializeRules([{ ...emptyDraft(), keepPer: "printing" }], "copy");
    expect(rule).toEqual({
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      priceMarketplace: undefined,
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      keepPer: "printing",
      excludeCopyIds: [],
    });
  });

  it("drops the marketplace when the filter carries no price bound", () => {
    const draft = { ...emptyDraft(), priceMarketplace: "cardmarket" as const };
    expect(serializeRules([draft], "card")[0]?.priceMarketplace).toBeUndefined();
  });

  it("keeps the marketplace when the filter bounds the price from below", () => {
    const draft = {
      ...emptyDraft(),
      filter: PRICED_FILTER,
      priceMarketplace: "cardmarket" as const,
    };
    expect(serializeRules([draft], "card")[0]?.priceMarketplace).toBe("cardmarket");
  });

  it("keeps the marketplace when the filter bounds the price from above", () => {
    const draft = {
      ...emptyDraft(),
      filter: { ...EMPTY_CARD_FILTERS, price: { min: null, max: 500 } },
      priceMarketplace: "tcgplayer" as const,
    };
    expect(serializeRules([draft], "copy")[0]?.priceMarketplace).toBe("tcgplayer");
  });

  it("omits an unset marketplace even under a price bound", () => {
    const draft = { ...emptyDraft(), filter: PRICED_FILTER };
    expect(serializeRules([draft], "card")[0]?.priceMarketplace).toBeUndefined();
  });

  it("serializes every draft it is given", () => {
    const rules = serializeRules([emptyDraft(), emptyDraft(["EN"])], "card");
    expect(rules).toHaveLength(2);
    expect(rules[1]?.filter.languages).toEqual(["EN"]);
  });
});
