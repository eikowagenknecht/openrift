import { describe, expect, it } from "vitest";

import {
  evaluateListRule,
  evaluateListRules,
  expandList,
  ownedCopyPrintingScope,
} from "./list-rule-eval.js";
import type {
  ExpandedEntry,
  ManualEntryRow,
  OwnedCopyRow,
  VirtualEntry,
} from "./list-rule-eval.js";
import { priceLookupFromMap } from "./price-lookup.js";
import { makePrinting as stubPrinting } from "./test-factories.js";
import type { TradePreference } from "./types/api/trade-preferences.js";
import type { Printing } from "./types/catalog.js";
import { listRulesSchema, MAX_LIST_RULES, ruleQuantitySchema } from "./types/list-rule.js";
import type { ListRule } from "./types/list-rule.js";
import { EMPTY_CARD_FILTERS } from "./types/search.js";
import type { CardFilters } from "./types/search.js";

const EMPTY_TRADE: TradePreference = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

function filters(overrides: Partial<CardFilters> = {}): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...overrides };
}

function makePrinting(
  id: string,
  cardId: string,
  overrides: Partial<Printing> & { type?: string; keywords?: string[] } = {},
): Printing {
  const { type, keywords, ...printing } = overrides;
  return stubPrinting({
    id,
    cardId,
    shortCode: id,
    publicCode: "PUB",
    card: {
      slug: cardId,
      name: `Card ${cardId}`,
      type,
      domains: ["fury"],
      energy: 1,
      might: 1,
      power: 1,
      keywords,
      mightBonus: 0,
    },
    ...printing,
  });
}

function ownedCopy(overrides: Partial<OwnedCopyRow> & { copyId: string }): OwnedCopyRow {
  return {
    printingId: "p1",
    cardId: "c1",
    collectionId: "col-1",
    reserved: false,
    ...overrides,
  };
}

describe("evaluateListRule — wish", () => {
  const catalog = [
    makePrinting("p1", "c1"),
    makePrinting("p2", "c1"),
    makePrinting("p3", "c2", { type: "legend" }),
  ];

  it("printing kind, fixed quantity, one entry per matched printing", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "printing", { catalog });
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.kind === "printing" && e.quantity === 1)).toBe(true);
  });

  it("printing kind honors excludeIds (printing ids)", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: ["p2"],
    };
    const out = evaluateListRule(rule, "printing", { catalog });
    expect(out.map((e) => e.printingId).sort()).toEqual(["p1", "p3"]);
  });

  it("card kind collapses printings to distinct cards", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "card", { catalog });
    expect(out.map((e) => e.cardId).sort()).toEqual(["c1", "c2"]);
  });

  it("playset quantity: 3 for normal cards, 1 for legends", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "playset", multiplier: 1 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "card", { catalog });
    const byCard = new Map(out.map((e) => [e.cardId, e.quantity]));
    expect(byCard.get("c1")).toBe(3);
    expect(byCard.get("c2")).toBe(1);
  });

  it("playset multiplier scales the playset size", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "playset", multiplier: 2 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "card", { catalog: [makePrinting("p1", "c1")] });
    expect(out[0]?.quantity).toBe(6);
  });

  it("card kind honors excludeIds (card ids)", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: ["c1"],
    };
    const out = evaluateListRule(rule, "card", { catalog });
    expect(out.map((e) => e.cardId)).toEqual(["c2"]);
  });

  it("respects the filter (isStandard:false drops standard printings)", () => {
    const mixed = [
      makePrinting("p1", "c1", { rarity: "common", finish: "normal" }),
      makePrinting("p2", "c2", { rarity: "common", finish: "foil" }),
    ];
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ isStandard: false }),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "printing", { catalog: mixed });
    expect(out.map((e) => e.printingId)).toEqual(["p2"]);
  });

  it("returns nothing when the filter matches nothing", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ sets: ["nonexistent"] }),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    expect(evaluateListRule(rule, "printing", { catalog })).toEqual([]);
  });

  it("skips zero-quantity demands", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 0 },
      excludeIds: [],
    };
    expect(evaluateListRule(rule, "card", { catalog })).toEqual([]);
  });

  it("netOwned subtracts owned copies and wants only the shortfall (card kind)", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "playset", multiplier: 1 },
      excludeIds: [],
      netOwned: true,
    };
    const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" })];
    const out = evaluateListRule(rule, "card", { catalog, ownedCopies });
    const byCard = new Map(out.map((entry) => [entry.cardId, entry.quantity]));
    expect(byCard.get("c1")).toBe(2);
    expect(byCard.get("c2")).toBe(1);
  });

  it("netOwned drops cards already at the target", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ sets: ["set-alpha"] }),
      quantity: { mode: "playset", multiplier: 1 },
      excludeIds: [],
      netOwned: true,
    };
    const ownedCopies = [1, 2, 3].map((index) =>
      ownedCopy({ copyId: `x${index}`, printingId: "p1", cardId: "c1" }),
    );
    const out = evaluateListRule(rule, "card", { catalog, ownedCopies });
    expect(out.map((entry) => entry.cardId)).toEqual(["c2"]);
  });

  it("netOwned subtracts per printing for printing-kind lists", () => {
    const twoPrintings = [makePrinting("p1", "c1"), makePrinting("p2", "c1")];
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
      netOwned: true,
    };
    const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" })];
    const out = evaluateListRule(rule, "printing", { catalog: twoPrintings, ownedCopies });
    expect(out.map((entry) => entry.printingId)).toEqual(["p2"]);
  });

  it("netOwned ignores reserved copies (about to leave via a live trade)", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ sets: ["set-alpha"] }),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
      netOwned: true,
    };
    const ownedCopies = [
      ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1", reserved: true }),
    ];
    const out = evaluateListRule(rule, "card", { catalog, ownedCopies });
    expect(out.map((entry) => entry.cardId).sort()).toEqual(["c1", "c2"]);
  });

  it("filters on custom tags only when assignments are supplied (ADR-034)", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ customTagSlugs: ["staple"] }),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    expect(evaluateListRule(rule, "card", { catalog })).toEqual([]);
    const out = evaluateListRule(rule, "card", {
      catalog,
      customTagAssignments: { c1: ["staple"] },
    });
    expect(out.map((entry) => entry.cardId)).toEqual(["c1"]);
  });
});

describe("evaluateListRule — trade", () => {
  const catalog = [makePrinting("p1", "c1"), makePrinting("p2", "c2")];

  function tradeRule(overrides: Partial<Extract<ListRule, { kind: "trade" }>> = {}): ListRule {
    return {
      kind: "trade",
      filter: filters(),
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
      ...overrides,
    };
  }

  it("keep=0 trades every matching owned copy (binder, UC1)", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule(), "copy", { catalog, ownedCopies });
    expect(out.map((e) => e.copyId).sort()).toEqual(["cp1", "cp2"]);
    expect(out.every((e) => e.kind === "copy" && e.quantity === 1)).toBe(true);
  });

  it("keeps N per card and trades the surplus", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp3", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((e) => e.copyId)).toEqual(["cp2", "cp3"]);
  });

  const enumOrders = {
    finishes: ["normal", "foil", "metal"],
    rarities: ["common", "uncommon", "rare"],
    artVariants: ["normal", "altart"],
  };
  const nicenessCatalog = [
    makePrinting("plain", "c1", { rarity: "common", finish: "normal" }),
    makePrinting("foil", "c1", { rarity: "common", finish: "foil" }),
    makePrinting("rare", "c1", { rarity: "rare", finish: "normal" }),
  ];

  it("keeps the special copy first, then the rarer standard one", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cpPlain", printingId: "plain", cardId: "c1" }),
      ownedCopy({ copyId: "cpFoil", printingId: "foil", cardId: "c1" }),
      ownedCopy({ copyId: "cpRare", printingId: "rare", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: nicenessCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpRare", "cpPlain"]);
  });

  it("keeps a signed common over a plain rare (special outranks rarity)", () => {
    const signedCatalog = [
      makePrinting("signed", "c1", { rarity: "common", finish: "normal", isSigned: true }),
      makePrinting("rare", "c1", { rarity: "rare", finish: "normal" }),
    ];
    const ownedCopies = [
      ownedCopy({ copyId: "cpSigned", printingId: "signed", cardId: "c1" }),
      ownedCopy({ copyId: "cpRare", printingId: "rare", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: signedCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpRare"]);
  });

  it("keeps the overnumbered copy over an otherwise equal special one", () => {
    const overCatalog = [
      makePrinting("foil", "c1", { rarity: "common", finish: "foil" }),
      makePrinting("over", "c1", { rarity: "common", finish: "foil", isOvernumbered: true }),
    ];
    const ownedCopies = [
      ownedCopy({ copyId: "cpFoil", printingId: "foil", cardId: "c1" }),
      ownedCopy({ copyId: "cpOver", printingId: "over", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: overCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpFoil"]);
  });

  it("keeps marked copies over unmarked ones of equal rarity and finish", () => {
    const markedCatalog = [
      makePrinting("foil", "c1", { rarity: "common", finish: "foil" }),
      makePrinting("promo", "c1", {
        rarity: "common",
        finish: "foil",
        markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
        canonicalRank: 1,
      }),
    ];
    const ownedCopies = [
      ownedCopy({ copyId: "cpFoil1", printingId: "foil", cardId: "c1" }),
      ownedCopy({ copyId: "cpFoil2", printingId: "foil", cardId: "c1" }),
      ownedCopy({ copyId: "cpPromo1", printingId: "promo", cardId: "c1" }),
      ownedCopy({ copyId: "cpPromo2", printingId: "promo", cardId: "c1" }),
      ownedCopy({ copyId: "cpPromo3", printingId: "promo", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 3 } }), "copy", {
      catalog: markedCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpFoil1", "cpFoil2"]);
  });

  it("falls back to copy id when no reference orders are supplied", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cpRare", printingId: "rare", cardId: "c1" }),
      ownedCopy({ copyId: "cpPlain", printingId: "plain", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: nicenessCatalog,
      ownedCopies,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpRare"]);
  });

  it("scopes to collectionIds when set", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1", collectionId: "col-1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1", collectionId: "col-2" }),
    ];
    const out = evaluateListRule(tradeRule({ collectionIds: ["col-1"] }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((e) => e.copyId)).toEqual(["cp1"]);
  });

  it("honors excludeCopyIds", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ excludeCopyIds: ["cp1"] }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((e) => e.copyId)).toEqual(["cp2"]);
  });

  it("keeps reserved copies in the pool and annotates them", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule(), "copy", { catalog, ownedCopies });
    const reserved = out.find((e) => e.copyId === "cp1");
    expect(reserved?.reserved).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("a reserved copy never fills a keep slot", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cp3", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["cp2", "cp3"]);
    expect(out.find((entry) => entry.copyId === "cp2")?.reserved).toBe(true);
    expect(out.find((entry) => entry.copyId === "cp3")?.reserved).toBe(false);
  });

  it("reserving the spare does not replenish the offer from kept copies", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp3", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp4", printingId: "p1", cardId: "c1", reserved: true }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 3 } }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cp4"]);
    expect(out[0]?.reserved).toBe(true);
  });

  it("printing niceness decides the keeps; reserved sorts below it", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cpPlain", printingId: "plain", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cpFoil", printingId: "foil", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: nicenessCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpPlain"]);
    expect(out[0]?.reserved).toBe(true);
  });

  it("only trades copies whose printing passes the filter", () => {
    const mixedCatalog = [
      makePrinting("p1", "c1", { finish: "normal" }),
      makePrinting("p2", "c2", { finish: "foil" }),
    ];
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p2", cardId: "c2" }),
    ];
    const out = evaluateListRule(
      tradeRule({ filter: filters({ finishesExclude: ["foil"] }) }),
      "copy",
      { catalog: mixedCatalog, ownedCopies },
    );
    expect(out.map((entry) => entry.copyId)).toEqual(["cp1"]);
  });

  it("keepPer printing keeps the count of each printing separately", () => {
    const twoPrintings = [makePrinting("pA", "c1"), makePrinting("pB", "c1")];
    const ownedCopies = [
      ...Array.from({ length: 5 }, (_unused, index) =>
        ownedCopy({ copyId: `a${index + 1}`, printingId: "pA", cardId: "c1" }),
      ),
      ownedCopy({ copyId: "b1", printingId: "pB", cardId: "c1" }),
      ownedCopy({ copyId: "b2", printingId: "pB", cardId: "c1" }),
    ];
    const perPrinting = evaluateListRule(
      tradeRule({ keepPer: "printing", keepPerCard: { mode: "playset", multiplier: 1 } }),
      "copy",
      { catalog: twoPrintings, ownedCopies },
    );
    expect(perPrinting.map((entry) => entry.copyId).sort()).toEqual(["a4", "a5"]);
    const perCard = evaluateListRule(
      tradeRule({ keepPerCard: { mode: "playset", multiplier: 1 } }),
      "copy",
      { catalog: twoPrintings, ownedCopies },
    );
    expect(perCard).toHaveLength(4);
  });

  it("UC4: keep two playsets, trade the rest", () => {
    const ownedCopies = Array.from({ length: 8 }, (_unused, index) =>
      ownedCopy({ copyId: `cp${index + 1}`, printingId: "p1", cardId: "c1" }),
    );
    const out = evaluateListRule(
      tradeRule({ keepPerCard: { mode: "playset", multiplier: 2 } }),
      "copy",
      {
        catalog,
        ownedCopies,
      },
    );
    expect(out).toHaveLength(2);
  });
});

describe("expandList", () => {
  function manual(overrides: Partial<ManualEntryRow> & { id: string }): ManualEntryRow {
    return { kind: "card", quantity: 1, tradeOverride: EMPTY_TRADE, ...overrides };
  }

  it("returns manual entries unchanged when there is no rule output", () => {
    const out = expandList("card", [manual({ id: "e1", cardId: "c1", quantity: 2 })], []);
    expect(out).toEqual<ExpandedEntry[]>([
      {
        kind: "card",
        cardId: "c1",
        printingId: undefined,
        copyId: undefined,
        quantity: 2,
        ruleQuantity: 0,
        id: "e1",
        source: "manual",
        tradeOverride: EMPTY_TRADE,
        reserved: undefined,
      },
    ]);
  });

  it("rule-only entries get null id, rule source, and ruleQuantity === quantity", () => {
    const ruleEntries: VirtualEntry[] = [{ kind: "card", cardId: "c1", quantity: 3 }];
    const out = expandList("card", [], ruleEntries);
    expect(out[0]).toMatchObject({
      id: null,
      source: "rule",
      quantity: 3,
      ruleQuantity: 3,
      cardId: "c1",
    });
  });

  it("card conflict sums the manual and rule parts (additive) and marks source both", () => {
    const out = expandList(
      "card",
      [manual({ id: "e1", cardId: "c1", quantity: 1 })],
      [{ kind: "card", cardId: "c1", quantity: 3 }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "e1", source: "both", quantity: 4, ruleQuantity: 3 });
  });

  it("card conflict sums regardless of which part is larger", () => {
    const out = expandList(
      "card",
      [manual({ id: "e1", cardId: "c1", quantity: 5 })],
      [{ kind: "card", cardId: "c1", quantity: 3 }],
    );
    expect(out[0]).toMatchObject({ quantity: 8, ruleQuantity: 3, source: "both" });
  });

  it("copy conflict unions (quantity stays 1), manual wins, source both", () => {
    const manualOverride: TradePreference = {
      pricePref: "tcg_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
    };
    const out = expandList(
      "copy",
      [manual({ id: "e1", kind: "copy", copyId: "cp1", tradeOverride: manualOverride })],
      [{ kind: "copy", copyId: "cp1", quantity: 1, reserved: true }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "e1",
      source: "both",
      quantity: 1,
      ruleQuantity: 1,
      tradeOverride: manualOverride,
      reserved: true,
    });
  });

  it("merges disjoint manual and rule entries", () => {
    const out = expandList(
      "printing",
      [manual({ id: "e1", kind: "printing", printingId: "p1" })],
      [{ kind: "printing", printingId: "p2", quantity: 1 }],
    );
    expect(out.map((e) => e.printingId).sort()).toEqual(["p1", "p2"]);
    expect(out.find((e) => e.printingId === "p1")).toMatchObject({
      source: "manual",
      ruleQuantity: 0,
    });
    expect(out.find((e) => e.printingId === "p2")).toMatchObject({
      source: "rule",
      ruleQuantity: 1,
    });
  });

  it("two rule entries for the same card stay source rule and take the max contribution", () => {
    const out = expandList(
      "card",
      [],
      [
        { kind: "card", cardId: "c1", quantity: 2 },
        { kind: "card", cardId: "c1", quantity: 5 },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: null,
      source: "rule",
      quantity: 5,
      ruleQuantity: 5,
      cardId: "c1",
    });
  });

  it("a card from a manual entry and two rules sums the manual part with the rules' max", () => {
    const out = expandList(
      "card",
      [manual({ id: "e1", cardId: "c1", quantity: 1 })],
      [
        { kind: "card", cardId: "c1", quantity: 2 },
        { kind: "card", cardId: "c1", quantity: 4 },
      ],
    );
    expect(out[0]).toMatchObject({ id: "e1", source: "both", quantity: 5, ruleQuantity: 4 });
  });
});

describe("evaluateListRules — multiple", () => {
  const catalog = [
    makePrinting("p1", "c1", { type: "legend" }),
    makePrinting("p2", "c2"),
    makePrinting("p3", "c3"),
  ];

  it("concatenates the output of every rule", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: filters({ types: ["legend"] }),
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
      },
      {
        kind: "wish",
        filter: filters({ types: ["unit"] }),
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
      },
    ];
    const out = evaluateListRules(rules, "card", { catalog });
    expect(out.map((entry) => entry.cardId).sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("returns an empty array when there are no rules", () => {
    expect(evaluateListRules([], "card", { catalog })).toEqual([]);
  });

  it("overlapping rules sum their quantities by default", () => {
    const rules: ListRule[] = [
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 2 }, excludeIds: [] },
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 4 }, excludeIds: [] },
    ];
    const out = evaluateListRules(rules, "card", { catalog });
    expect(out).toHaveLength(3);
    expect(out.every((entry) => entry.quantity === 6)).toBe(true);
    const expanded = expandList("card", [], out);
    expect(expanded.every((entry) => entry.quantity === 6 && entry.source === "rule")).toBe(true);
  });

  it("max mode takes the most demanding rule instead of summing", () => {
    const rules: ListRule[] = [
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 2 }, excludeIds: [] },
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 4 }, excludeIds: [] },
    ];
    const out = evaluateListRules(rules, "card", { catalog }, "max");
    expect(out).toHaveLength(3);
    expect(out.every((entry) => entry.quantity === 4)).toBe(true);
  });

  it("a key excluded by one rule still gets the other rule's contribution", () => {
    const rules: ListRule[] = [
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 2 }, excludeIds: ["c2"] },
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 4 }, excludeIds: [] },
    ];
    const out = evaluateListRules(rules, "card", { catalog });
    const byCard = new Map(out.map((entry) => [entry.cardId, entry.quantity]));
    expect(byCard.get("c1")).toBe(6);
    expect(byCard.get("c2")).toBe(4);
  });

  it("summed netOwned rules share one owned pool (no double-crediting)", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: filters(),
        quantity: { mode: "fixed", n: 3 },
        excludeIds: [],
        netOwned: true,
      },
      {
        kind: "wish",
        filter: filters(),
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
        netOwned: true,
      },
    ];
    const singleCard = [makePrinting("p1", "c1")];
    const ownedCopies = [
      ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "x2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRules(rules, "card", { catalog: singleCard, ownedCopies });
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 2, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });

  it("owned copies only net the netOwned rules' share of a mixed sum", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: filters(),
        quantity: { mode: "fixed", n: 3 },
        excludeIds: [],
        netOwned: true,
      },
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 2 }, excludeIds: [] },
    ];
    const singleCard = [makePrinting("p1", "c1")];
    const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" })];
    const out = evaluateListRules(rules, "card", { catalog: singleCard, ownedCopies });
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 4, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });

  it("max mode nets the owned pool off the largest netOwned demand", () => {
    const rules: ListRule[] = [
      {
        kind: "wish",
        filter: filters(),
        quantity: { mode: "fixed", n: 3 },
        excludeIds: [],
        netOwned: true,
      },
      {
        kind: "wish",
        filter: filters(),
        quantity: { mode: "fixed", n: 1 },
        excludeIds: [],
        netOwned: true,
      },
    ];
    const singleCard = [makePrinting("p1", "c1")];
    const ownedCopies = [
      ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "x2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRules(rules, "card", { catalog: singleCard, ownedCopies }, "max");
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 1, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });
});

describe("evaluateListRules — acceptable printings and filter-aware netting (amendment 3)", () => {
  const catalog = [
    makePrinting("p1", "c1", { finish: "normal" }),
    makePrinting("p2", "c1", { finish: "foil" }),
  ];

  function wishRule(overrides: Partial<Extract<ListRule, { kind: "wish" }>> = {}): ListRule {
    return {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 3 },
      excludeIds: [],
      ...overrides,
    };
  }

  it("card entries carry the printings the filter matched as their acceptable set", () => {
    const out = evaluateListRules(
      [wishRule({ filter: filters({ finishesExclude: ["foil"] }) })],
      "card",
      { catalog },
    );
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 3, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });

  it("an unrestricted filter still lists every printing of the card", () => {
    const out = evaluateListRules([wishRule()], "card", { catalog });
    expect(out[0]?.acceptablePrintingIds).toEqual(new Set(["p1", "p2"]));
  });

  it("printing-kind entries carry no acceptable set (the key is the printing)", () => {
    const out = evaluateListRules([wishRule()], "printing", { catalog });
    expect(out.every((entry) => entry.acceptablePrintingIds === undefined)).toBe(true);
  });

  it("overlapping rules union their acceptable printings", () => {
    const rules = [
      wishRule({ filter: filters({ finishes: ["normal"] }) }),
      wishRule({ filter: filters({ finishes: ["foil"] }) }),
    ];
    const out = evaluateListRules(rules, "card", { catalog });
    expect(out).toHaveLength(1);
    expect(out[0]?.acceptablePrintingIds).toEqual(new Set(["p1", "p2"]));
  });

  it("netOwned ignores owned copies whose printing the filter excludes", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "x1", printingId: "p2", cardId: "c1" }),
      ownedCopy({ copyId: "x2", printingId: "p2", cardId: "c1" }),
      ownedCopy({ copyId: "x3", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRules(
      [wishRule({ filter: filters({ finishesExclude: ["foil"] }), netOwned: true })],
      "card",
      { catalog, ownedCopies },
    );
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 2, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });

  it("the netting pool comes from the netOwned rules only, not every rule", () => {
    const rules = [
      wishRule({
        filter: filters({ finishes: ["normal"] }),
        quantity: { mode: "fixed", n: 2 },
        netOwned: true,
      }),
      wishRule({ filter: filters({ finishes: ["foil"] }), quantity: { mode: "fixed", n: 1 } }),
    ];
    const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "p2", cardId: "c1" })];
    const out = evaluateListRules(rules, "card", { catalog, ownedCopies });
    expect(out[0]?.quantity).toBe(3);
  });

  describe("countSpecialVersions (widened netting pool)", () => {
    const specialsCatalog = [
      makePrinting("plain", "c1"),
      makePrinting("alt", "c1", { artVariant: "altart", finish: "foil" }),
      makePrinting("alt-only", "c2", { artVariant: "altart", finish: "foil" }),
    ];

    it("owned special versions fill the shortfall while the acceptable set stays strict", () => {
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "alt", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "alt", cardId: "c1" }),
      ];
      expect(
        evaluateListRules(
          [wishRule({ filter: filters({ isStandard: true }), netOwned: true })],
          "card",
          { catalog: specialsCatalog, ownedCopies },
        ),
      ).toEqual([
        { kind: "card", cardId: "c1", quantity: 3, acceptablePrintingIds: new Set(["plain"]) },
      ]);
      expect(
        evaluateListRules(
          [
            wishRule({
              filter: filters({ isStandard: true }),
              netOwned: true,
              countSpecialVersions: true,
            }),
          ],
          "card",
          { catalog: specialsCatalog, ownedCopies },
        ),
      ).toEqual([
        { kind: "card", cardId: "c1", quantity: 1, acceptablePrintingIds: new Set(["plain"]) },
      ]);
    });

    it("drops a want fully covered by special versions", () => {
      const ownedCopies = [1, 2, 3].map((index) =>
        ownedCopy({ copyId: `x${index}`, printingId: "alt", cardId: "c1" }),
      );
      const out = evaluateListRules(
        [
          wishRule({
            filter: filters({ isStandard: true }),
            netOwned: true,
            countSpecialVersions: true,
          }),
        ],
        "card",
        { catalog: specialsCatalog, ownedCopies },
      );
      expect(out).toEqual([]);
    });

    it("never adds wants for cards only the relaxed filter matches", () => {
      const out = evaluateListRules(
        [
          wishRule({
            filter: filters({ isStandard: true }),
            netOwned: true,
            countSpecialVersions: true,
          }),
        ],
        "card",
        { catalog: specialsCatalog },
      );
      expect(out.map((entry) => entry.cardId)).toEqual(["c1"]);
    });

    it("relaxes only the standard flag — other facets still gate the pool", () => {
      const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "alt", cardId: "c1" })];
      const out = evaluateListRules(
        [
          wishRule({
            filter: filters({ isStandard: true, artVariantsExclude: ["altart"] }),
            netOwned: true,
            countSpecialVersions: true,
          }),
        ],
        "card",
        { catalog: specialsCatalog, ownedCopies },
      );
      expect(out[0]).toMatchObject({ cardId: "c1", quantity: 3 });
    });

    it("is inert without a standard-printings restriction (never counts plain copies)", () => {
      const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "plain", cardId: "c1" })];
      const out = evaluateListRules(
        [
          wishRule({
            filter: filters({ isStandard: false }),
            netOwned: true,
            countSpecialVersions: true,
          }),
        ],
        "card",
        { catalog: specialsCatalog, ownedCopies },
      );
      expect(out.find((entry) => entry.cardId === "c1")).toMatchObject({ quantity: 3 });
    });

    it("does nothing without netOwned", () => {
      const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "alt", cardId: "c1" })];
      const out = evaluateListRules(
        [wishRule({ filter: filters({ isStandard: true }), countSpecialVersions: true })],
        "card",
        { catalog: specialsCatalog, ownedCopies },
      );
      expect(out[0]).toMatchObject({ cardId: "c1", quantity: 3 });
    });

    it("leaves printing-kind netting untouched", () => {
      const ownedCopies = [ownedCopy({ copyId: "x1", printingId: "alt", cardId: "c1" })];
      const out = evaluateListRules(
        [
          wishRule({
            quantity: { mode: "fixed", n: 1 },
            netOwned: true,
            countSpecialVersions: true,
          }),
        ],
        "printing",
        { catalog: specialsCatalog, ownedCopies },
      );
      expect(out.map((entry) => entry.printingId).sort()).toEqual(["alt-only", "plain"]);
    });

    it("survives the rules schema round-trip", () => {
      const parsed = listRulesSchema.parse([
        {
          kind: "wish",
          filter: filters(),
          quantity: { mode: "fixed", n: 1 },
          excludeIds: [],
          netOwned: true,
          countSpecialVersions: true,
        },
      ]);
      expect(parsed[0]).toMatchObject({ countSpecialVersions: true });
    });
  });

  describe("price-blind netting (ADR-034 amendment 6)", () => {
    const pricedCatalog = [
      makePrinting("cheap", "c1"),
      makePrinting("dear", "c1", { artVariant: "altart", finish: "foil" }),
      makePrinting("unpriced", "c1", { finish: "foil", rarity: "rare" }),
    ];
    const priceLookup = priceLookupFromMap({
      cheap: { cardtrader: 167 },
      dear: { cardtrader: 625 },
      // "unpriced" is deliberately absent: no price on any marketplace.
    });
    const underCap = (overrides: Partial<Extract<ListRule, { kind: "wish" }>> = {}): ListRule =>
      wishRule({
        filter: filters({ isStandard: true, price: { min: null, max: 1.75 } }),
        priceMarketplace: "cardtrader",
        netOwned: true,
        ...overrides,
      });

    it("an owned special above the cap still fills the want", () => {
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "dear", cardId: "c1" }),
      ];
      expect(
        evaluateListRules([underCap({ countSpecialVersions: true })], "card", {
          catalog: pricedCatalog,
          ownedCopies,
          priceLookup,
        }),
      ).toEqual([]);
    });

    it("an owned copy of an unpriced printing counts too", () => {
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "unpriced", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "unpriced", cardId: "c1" }),
      ];
      expect(
        evaluateListRules([underCap({ countSpecialVersions: true })], "card", {
          catalog: pricedCatalog,
          ownedCopies,
          priceLookup,
        }),
      ).toEqual([]);
    });

    it("nets price-blind without countSpecialVersions", () => {
      const bothStandard = [
        makePrinting("cheap", "c1"),
        makePrinting("dear", "c1", { finish: "foil", rarity: "rare" }),
      ];
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "dear", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "dear", cardId: "c1" }),
      ];
      expect(
        evaluateListRules([underCap()], "card", {
          catalog: bothStandard,
          ownedCopies,
          priceLookup,
        }),
      ).toEqual([]);
    });

    it("nets price-blind on a rule with no standard restriction", () => {
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "dear", cardId: "c1" }),
      ];
      expect(
        evaluateListRules(
          [underCap({ filter: filters({ price: { min: null, max: 1.75 } }) })],
          "card",
          {
            catalog: pricedCatalog,
            ownedCopies,
            priceLookup,
          },
        ),
      ).toEqual([]);
    });

    it("the cap still gates the want and its acceptable printings", () => {
      expect(
        evaluateListRules([underCap({ countSpecialVersions: true })], "card", {
          catalog: pricedCatalog,
          priceLookup,
        }),
      ).toEqual([
        { kind: "card", cardId: "c1", quantity: 3, acceptablePrintingIds: new Set(["cheap"]) },
      ]);
    });

    it("relaxes only price — other facets still gate the pool", () => {
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "cheap", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "dear", cardId: "c1" }),
      ];
      expect(
        evaluateListRules(
          [
            underCap({
              filter: filters({
                isStandard: true,
                artVariantsExclude: ["altart"],
                price: { min: null, max: 1.75 },
              }),
              countSpecialVersions: true,
            }),
          ],
          "card",
          { catalog: pricedCatalog, ownedCopies, priceLookup },
        ),
      ).toEqual([
        { kind: "card", cardId: "c1", quantity: 2, acceptablePrintingIds: new Set(["cheap"]) },
      ]);
    });

    it("leaves a plain (non-netting) rule's matches on the cap", () => {
      expect(
        evaluateListRules(
          [
            wishRule({
              filter: filters({ price: { min: null, max: 1.75 } }),
              priceMarketplace: "cardtrader",
            }),
          ],
          "printing",
          { catalog: pricedCatalog, priceLookup },
        ).map((entry) => entry.printingId),
      ).toEqual(["cheap"]);
    });

    it("two max-combined rules share one price-blind pool", () => {
      const beamCatalog = [
        makePrinting("plain", "c1", { rarity: "uncommon" }),
        makePrinting("foil", "c1", { rarity: "uncommon", finish: "foil" }),
      ];
      const beamPrices = priceLookupFromMap({
        plain: { cardtrader: 40 },
        foil: { cardtrader: 237 },
      });
      const ownedCopies = [
        ownedCopy({ copyId: "x1", printingId: "plain", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "plain", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "foil", cardId: "c1" }),
      ];
      const rules = [
        underCap({ quantity: { mode: "playset", multiplier: 1 }, countSpecialVersions: true }),
        underCap({
          filter: filters({ isStandard: true, price: { min: 1, max: 3.55 } }),
          quantity: { mode: "fixed", n: 1 },
          countSpecialVersions: true,
        }),
      ];
      expect(
        evaluateListRules(
          rules,
          "card",
          {
            catalog: beamCatalog,
            ownedCopies,
            priceLookup: beamPrices,
          },
          "max",
        ),
      ).toEqual([]);
    });

    it("ownedCopyPrintingScope loads the copies the widened pool needs", () => {
      expect(
        ownedCopyPrintingScope([underCap({ countSpecialVersions: true })], "card", {
          catalog: pricedCatalog,
          priceLookup,
        }).toSorted(),
      ).toEqual(["cheap", "dear", "unpriced"]);
    });
  });

  it("expandList keeps the set on rule-only entries and drops it on manual overlap", () => {
    const ruleEntries: VirtualEntry[] = [
      { kind: "card", cardId: "c1", quantity: 3, acceptablePrintingIds: new Set(["p1"]) },
      { kind: "card", cardId: "c2", quantity: 3, acceptablePrintingIds: new Set(["p3"]) },
    ];
    const out = expandList(
      "card",
      [{ id: "e1", kind: "card", cardId: "c1", quantity: 1, tradeOverride: EMPTY_TRADE }],
      ruleEntries,
    );
    const both = out.find((entry) => entry.cardId === "c1");
    const ruleOnly = out.find((entry) => entry.cardId === "c2");
    expect(both).toMatchObject({ source: "both", acceptablePrintingIds: undefined });
    expect(ruleOnly?.acceptablePrintingIds).toEqual(new Set(["p3"]));
  });
});

describe("evaluateListRules — trade combine (the Zeri matrix)", () => {
  const enumOrders = {
    finishes: ["normal", "foil", "metal"],
    rarities: ["common", "uncommon", "rare"],
    artVariants: ["normal", "altart"],
  };
  const catalog = [
    makePrinting("z-plain", "zeri", { rarity: "common", finish: "normal" }),
    makePrinting("z-foil", "zeri", { rarity: "common", finish: "foil" }),
    makePrinting("z-foil-signed", "zeri", { rarity: "common", finish: "foil", isSigned: true }),
  ];
  const ownedCopies = [
    ownedCopy({ copyId: "z1", printingId: "z-foil-signed", cardId: "zeri" }),
    ownedCopy({ copyId: "z2", printingId: "z-foil", cardId: "zeri" }),
    ownedCopy({ copyId: "z3", printingId: "z-plain", cardId: "zeri" }),
    ownedCopy({ copyId: "z4", printingId: "z-plain", cardId: "zeri" }),
    ownedCopy({ copyId: "z5", printingId: "z-plain", cardId: "zeri" }),
  ];
  const rules: ListRule[] = [
    {
      kind: "trade",
      filter: filters(),
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 1 },
      excludeCopyIds: [],
    },
    {
      kind: "trade",
      filter: filters({ finishes: ["normal"] }),
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 2 },
      excludeCopyIds: [],
    },
  ];
  const ctx = { catalog, ownedCopies, enumOrders };

  it("protect (default): a copy any rule kept is never offered", () => {
    const out = evaluateListRules(rules, "copy", ctx);
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z5"]);
  });

  it("count-sum: keep 1 + 2 = 3 nicest across the union", () => {
    const out = evaluateListRules(rules, "copy", ctx, "count-sum");
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z4", "z5"]);
  });

  it("count-max: keep max(1, 2) = 2 nicest across the union", () => {
    const out = evaluateListRules(rules, "copy", ctx, "count-max");
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z3", "z4", "z5"]);
  });

  it("single rule: every mode degenerates to the same keep-N split", () => {
    for (const mode of [undefined, "protect", "count-sum", "count-max"] as const) {
      const out = evaluateListRules([rules[0]!], "copy", ctx, mode);
      expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z3", "z4", "z5"]);
    }
  });

  it("protect never leaks a copy excluded by the only rule matching it", () => {
    const scoped: ListRule[] = [
      {
        kind: "trade",
        filter: filters({ finishes: ["foil"] }),
        collectionIds: null,
        keepPerCard: { mode: "fixed", n: 1 },
        excludeCopyIds: [],
      },
      {
        kind: "trade",
        filter: filters({ finishes: ["normal"] }),
        collectionIds: null,
        keepPerCard: { mode: "fixed", n: 1 },
        excludeCopyIds: ["z5"],
      },
    ];
    const out = evaluateListRules(scoped, "copy", ctx);
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z4"]);
  });

  it("count modes combine within a grouping and union the keeps across them", () => {
    const mixed: ListRule[] = [
      rules[0]!,
      {
        kind: "trade",
        filter: filters(),
        collectionIds: null,
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "printing",
        excludeCopyIds: [],
      },
    ];
    for (const mode of ["count-sum", "count-max"] as const) {
      const out = evaluateListRules(mixed, "copy", ctx, mode);
      expect(out.map((entry) => entry.copyId).sort()).toEqual(["z4", "z5"]);
    }
  });

  it("carries the reserved annotation through combination", () => {
    const reservedCopies = ownedCopies.map((copy) =>
      copy.copyId === "z4" || copy.copyId === "z5" ? { ...copy, reserved: true } : copy,
    );
    const keepOnePlain: ListRule[] = [
      rules[0]!,
      {
        kind: "trade",
        filter: filters({ finishes: ["normal"] }),
        collectionIds: null,
        keepPerCard: { mode: "fixed", n: 1 },
        excludeCopyIds: [],
      },
    ];
    const out = evaluateListRules(keepOnePlain, "copy", { ...ctx, ownedCopies: reservedCopies });
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z4", "z5"]);
    expect(out.find((entry) => entry.copyId === "z4")?.reserved).toBe(true);
    expect(out.find((entry) => entry.copyId === "z5")?.reserved).toBe(true);
  });

  it("count modes keep a copy that stays, not the reserved one", () => {
    const reservedCopies = ownedCopies.map((copy) =>
      copy.copyId === "z5" ? { ...copy, reserved: true } : copy,
    );
    const reservedCtx = { ...ctx, ownedCopies: reservedCopies };
    for (const mode of [undefined, "count-max"] as const) {
      const out = evaluateListRules([rules[0]!], "copy", reservedCtx, mode);
      expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z3", "z4", "z5"]);
      expect(out.find((entry) => entry.copyId === "z5")?.reserved).toBe(true);
    }
  });
});

describe("listRulesSchema — rule count cap", () => {
  const wishRule: ListRule = {
    kind: "wish",
    filter: EMPTY_CARD_FILTERS,
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
  };

  it("caps at 10 rules", () => {
    expect(MAX_LIST_RULES).toBe(10);
  });

  it("accepts exactly MAX_LIST_RULES rules", () => {
    const rules = Array.from({ length: MAX_LIST_RULES }, () => wishRule);
    expect(listRulesSchema.safeParse(rules).success).toBe(true);
  });

  it("rejects more than MAX_LIST_RULES rules", () => {
    const rules = Array.from({ length: MAX_LIST_RULES + 1 }, () => wishRule);
    const result = listRulesSchema.safeParse(rules);
    expect(result.success).toBe(false);
  });

  it("accepts an empty rule set", () => {
    expect(listRulesSchema.safeParse([]).success).toBe(true);
  });

  it("accepts keepPer on trade rules and rejects unknown groupings", () => {
    const base = {
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 1 },
      excludeCopyIds: [],
    };
    // Absent = per card (rules saved before the field existed).
    expect(listRulesSchema.safeParse([base]).success).toBe(true);
    expect(listRulesSchema.safeParse([{ ...base, keepPer: "printing" }]).success).toBe(true);
    expect(listRulesSchema.safeParse([{ ...base, keepPer: "card" }]).success).toBe(true);
    expect(listRulesSchema.safeParse([{ ...base, keepPer: "set" }]).success).toBe(false);
  });
});

describe("ruleQuantitySchema — bounds", () => {
  it("accepts a non-negative fixed count", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "fixed", n: 0 }).success).toBe(true);
    expect(ruleQuantitySchema.safeParse({ mode: "fixed", n: 3 }).success).toBe(true);
  });

  it("rejects a negative fixed count", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "fixed", n: -1 }).success).toBe(false);
  });

  it("rejects a non-integer fixed count", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "fixed", n: 1.5 }).success).toBe(false);
  });

  it("accepts a playset multiplier of at least one", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "playset", multiplier: 1 }).success).toBe(true);
  });

  it("rejects a playset multiplier below one", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "playset", multiplier: 0 }).success).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(ruleQuantitySchema.safeParse({ mode: "ratio", n: 1 }).success).toBe(false);
  });
});

describe("ownedCopyPrintingScope", () => {
  const catalog = [
    makePrinting("p1", "c1", { finish: "normal" }),
    makePrinting("p2", "c1", { finish: "foil" }),
    makePrinting("p3", "c2", { finish: "normal" }),
  ];

  it("a trade rule scopes to exactly the printings its filter matches", () => {
    const rule: ListRule = {
      kind: "trade",
      filter: filters({ finishes: ["foil"] }),
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
    };
    expect(ownedCopyPrintingScope([rule], "card", { catalog }).toSorted()).toEqual(["p2"]);
  });

  it("a plain wish rule needs no copies at all", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "fixed", n: 1 },
      excludeIds: [],
    };
    expect(ownedCopyPrintingScope([rule], "card", { catalog })).toEqual([]);
  });

  it("a netOwned wish rule scopes to its netting pool", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ finishes: ["normal"] }),
      quantity: { mode: "playset", multiplier: 1 },
      excludeIds: [],
      netOwned: true,
    };
    expect(ownedCopyPrintingScope([rule], "card", { catalog }).toSorted()).toEqual(["p1", "p3"]);
    expect(ownedCopyPrintingScope([rule], "printing", { catalog }).toSorted()).toEqual([
      "p1",
      "p3",
    ]);
  });

  it("unions the scope across several rules", () => {
    const rules: ListRule[] = [
      {
        kind: "trade",
        filter: filters({ finishes: ["foil"] }),
        collectionIds: null,
        keepPerCard: { mode: "fixed", n: 0 },
        excludeCopyIds: [],
      },
      {
        kind: "wish",
        filter: filters({ sets: ["set-alpha"], finishes: ["normal"] }),
        quantity: { mode: "playset", multiplier: 1 },
        excludeIds: [],
        netOwned: true,
      },
    ];
    expect(ownedCopyPrintingScope(rules, "card", { catalog }).toSorted()).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it.each([["card" as const], ["printing" as const]])(
    "evaluating with only in-scope copies matches the full set (%s kind)",
    (listKind) => {
      const rules: ListRule[] = [
        {
          kind: "trade",
          filter: filters({ finishes: ["foil"] }),
          collectionIds: null,
          keepPerCard: { mode: "fixed", n: 0 },
          excludeCopyIds: [],
        },
        {
          kind: "wish",
          filter: filters({ finishes: ["normal"] }),
          quantity: { mode: "playset", multiplier: 1 },
          excludeIds: [],
          netOwned: true,
        },
      ];
      const allCopies = [
        ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" }),
        ownedCopy({ copyId: "x2", printingId: "p2", cardId: "c1" }),
        ownedCopy({ copyId: "x3", printingId: "p3", cardId: "c2" }),
        ownedCopy({ copyId: "x4", printingId: "p-unmatched", cardId: "c9" }),
      ];
      const scope = new Set(ownedCopyPrintingScope(rules, listKind, { catalog }));
      const narrowed = allCopies.filter((copy) => scope.has(copy.printingId));

      expect(narrowed.length).toBeLessThan(allCopies.length);
      expect(evaluateListRules(rules, listKind, { catalog, ownedCopies: narrowed })).toEqual(
        evaluateListRules(rules, listKind, { catalog, ownedCopies: allCopies }),
      );
    },
  );
});

describe("price-bounded rules (priceMarketplace + priceLookup)", () => {
  // Wire map holds integer cents; the lookup serves major units (1.50, 7, 9).
  const priceLookup = priceLookupFromMap({
    p1: { cardmarket: 150, tcgplayer: 900 },
    p2: { cardmarket: 700 },
    // p3 has no price on any marketplace.
  });
  const catalog = [makePrinting("p1", "c1"), makePrinting("p2", "c1"), makePrinting("p3", "c2")];

  const wishUnder = (max: number, priceMarketplace: ListRule["priceMarketplace"]): ListRule => ({
    kind: "wish",
    filter: filters({ price: { min: null, max } }),
    priceMarketplace,
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
  });

  it("bounds against the rule's own marketplace, skipping price-less printings", () => {
    const out = evaluateListRule(wishUnder(5, "cardmarket"), "printing", { catalog, priceLookup });
    expect(out.map((e) => e.printingId)).toEqual(["p1"]);
  });

  it("the same bound reads a different quote on a different marketplace", () => {
    const out = evaluateListRule(wishUnder(5, "tcgplayer"), "printing", { catalog, priceLookup });
    expect(out).toEqual([]);
  });

  it("without a lookup in context, a bounded rule matches no priced printing", () => {
    expect(evaluateListRule(wishUnder(5, "cardmarket"), "printing", { catalog })).toEqual([]);
  });

  it("a trade rule offers only copies whose printing passes the bound", () => {
    const rule: ListRule = {
      kind: "trade",
      filter: filters({ price: { min: 2, max: null } }),
      priceMarketplace: "cardmarket",
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
    };
    const ownedCopies = [
      ownedCopy({ copyId: "x1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "x2", printingId: "p2", cardId: "c1" }),
      ownedCopy({ copyId: "x3", printingId: "p3", cardId: "c2" }),
    ];
    const out = evaluateListRule(rule, "copy", { catalog, ownedCopies, priceLookup });
    expect(out.map((e) => e.copyId)).toEqual(["x2"]);
  });

  it("a standard-printings price floor ignores the card's showcase printing", () => {
    const sonaCatalog = [
      makePrinting("ogn-073", "sona", { rarity: "rare", finish: "foil" }),
      makePrinting("ven-sp2", "sona", { rarity: "showcase", finish: "foil" }),
    ];
    const rule: ListRule = {
      kind: "wish",
      filter: filters({ isStandard: true, price: { min: 1.01, max: null } }),
      priceMarketplace: "cardmarket",
      quantity: { mode: "fixed", n: 1 },
      netOwned: true,
      countSpecialVersions: true,
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "card", {
      catalog: sonaCatalog,
      priceLookup: priceLookupFromMap({
        "ogn-073": { cardmarket: 46 },
        "ven-sp2": { cardmarket: 900 },
      }),
    });
    expect(out).toEqual([]);
  });

  it("ownedCopyPrintingScope applies the same price bound as evaluation", () => {
    const rule: ListRule = {
      kind: "trade",
      filter: filters({ price: { min: null, max: 5 } }),
      priceMarketplace: "cardmarket",
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
    };
    expect(ownedCopyPrintingScope([rule], "card", { catalog, priceLookup })).toEqual(["p1"]);
    // ownedCopyPrintingScope must apply the same price bound as evaluateListRules, or copy loading misses what rules match.
    expect(ownedCopyPrintingScope([rule], "card", { catalog })).toEqual([]);
  });
});

describe("listRulesSchema — price marketplace requirement", () => {
  const boundedWish = {
    kind: "wish",
    filter: { ...EMPTY_CARD_FILTERS, price: { min: 1, max: null } },
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
  };

  it("rejects a price bound without a marketplace", () => {
    expect(listRulesSchema.safeParse([boundedWish]).success).toBe(false);
  });

  it("accepts a price bound with a marketplace", () => {
    const rule = { ...boundedWish, priceMarketplace: "cardmarket" };
    expect(listRulesSchema.safeParse([rule]).success).toBe(true);
  });

  it("rejects an unknown marketplace", () => {
    const rule = { ...boundedWish, priceMarketplace: "ebay" };
    expect(listRulesSchema.safeParse([rule]).success).toBe(false);
  });

  it("accepts a marketplace without a bound (inert leftover)", () => {
    const rule = { ...boundedWish, filter: EMPTY_CARD_FILTERS, priceMarketplace: "tcgplayer" };
    expect(listRulesSchema.safeParse([rule]).success).toBe(true);
  });

  it("applies the same requirement to trade rules", () => {
    const boundedTrade = {
      kind: "trade",
      filter: { ...EMPTY_CARD_FILTERS, price: { min: null, max: 5 } },
      collectionIds: null,
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
    };
    expect(listRulesSchema.safeParse([boundedTrade]).success).toBe(false);
    expect(
      listRulesSchema.safeParse([{ ...boundedTrade, priceMarketplace: "cardtrader" }]).success,
    ).toBe(true);
  });
});
