import type { ListRule, Printing } from "@openrift/shared";
import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { entryToExcludeTarget, excludeEntryFromRules } from "./rule-exclude";

// A common printing of card A and a rare printing of card B. The "common" and
// "rare" rules below each match exactly one of them.
const commonA: Printing = stubPrinting({ id: "p-a", cardId: "card-a", rarity: "common" });
const rareB: Printing = stubPrinting({ id: "p-b", cardId: "card-b", rarity: "rare" });
const catalog = [commonA, rareB];

function wishRule(overrides: Partial<Extract<ListRule, { kind: "wish" }>> = {}): ListRule {
  return {
    kind: "wish",
    filter: { ...EMPTY_CARD_FILTERS, rarities: ["common"] },
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
    netOwned: false,
    ...overrides,
  };
}

function tradeRule(overrides: Partial<Extract<ListRule, { kind: "trade" }>> = {}): ListRule {
  return {
    kind: "trade",
    filter: EMPTY_CARD_FILTERS,
    collectionIds: null,
    keepPerCard: { mode: "fixed", n: 0 },
    excludeCopyIds: [],
    ...overrides,
  };
}

describe("excludeEntryFromRules", () => {
  it("excludes a card from the wish rule whose filter matches it", () => {
    const next = excludeEntryFromRules([wishRule()], { kind: "card", cardId: "card-a" }, catalog);
    expect(next).toEqual([expect.objectContaining({ excludeIds: ["card-a"] })]);
  });

  it("excludes a printing target by printing id", () => {
    const next = excludeEntryFromRules(
      [wishRule()],
      { kind: "printing", printingId: "p-a" },
      catalog,
    );
    expect(next?.[0]).toMatchObject({ excludeIds: ["p-a"] });
  });

  it("adds the id to every wish rule that matches, leaving non-matching rules untouched", () => {
    // Two rules both match card A (one by rarity, one by the empty all-match
    // filter); a third matches only card B and must stay empty.
    const rules = [
      wishRule(),
      wishRule({ filter: EMPTY_CARD_FILTERS }),
      wishRule({ filter: { ...EMPTY_CARD_FILTERS, rarities: ["rare"] } }),
    ];
    const next = excludeEntryFromRules(rules, { kind: "card", cardId: "card-a" }, catalog);
    expect(next?.map((rule) => (rule.kind === "wish" ? rule.excludeIds : []))).toEqual([
      ["card-a"],
      ["card-a"],
      [],
    ]);
  });

  it("returns null when no rule produces the target", () => {
    const next = excludeEntryFromRules([wishRule()], { kind: "card", cardId: "card-b" }, catalog);
    expect(next).toBeNull();
  });

  it("returns null when the id is already excluded", () => {
    const next = excludeEntryFromRules(
      [wishRule({ excludeIds: ["card-a"] })],
      { kind: "card", cardId: "card-a" },
      catalog,
    );
    expect(next).toBeNull();
  });

  it("appends a copy id to a trade rule's excludeCopyIds", () => {
    const next = excludeEntryFromRules([tradeRule()], { kind: "copy", copyId: "copy-1" }, catalog);
    expect(next).toEqual([expect.objectContaining({ excludeCopyIds: ["copy-1"] })]);
  });

  it("returns null when a copy is already excluded from the trade rule", () => {
    const next = excludeEntryFromRules(
      [tradeRule({ excludeCopyIds: ["copy-1"] })],
      { kind: "copy", copyId: "copy-1" },
      catalog,
    );
    expect(next).toBeNull();
  });

  it("does not mutate the input rules", () => {
    const rules = [wishRule()];
    excludeEntryFromRules(rules, { kind: "card", cardId: "card-a" }, catalog);
    expect(rules[0]).toMatchObject({ excludeIds: [] });
  });
});

describe("entryToExcludeTarget", () => {
  it("maps each entry kind to the matching id", () => {
    expect(entryToExcludeTarget({ kind: "card", cardId: "c1" } as never)).toEqual({
      kind: "card",
      cardId: "c1",
    });
    expect(entryToExcludeTarget({ kind: "printing", printingId: "p1" } as never)).toEqual({
      kind: "printing",
      printingId: "p1",
    });
    expect(entryToExcludeTarget({ kind: "copy", copyId: "cp1" } as never)).toEqual({
      kind: "copy",
      copyId: "cp1",
    });
  });
});
