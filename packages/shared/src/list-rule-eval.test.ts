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
import {
  EMPTY_CARD_FILTERS,
  listRulesSchema,
  MAX_LIST_RULES,
  ruleQuantitySchema,
} from "./types/index.js";
import type { CardFilters, ListRule, Printing, TradePreference } from "./types/index.js";

const EMPTY_TRADE: TradePreference = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

function filters(overrides: Partial<CardFilters> = {}): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...overrides };
}

function makePrinting(
  id: string,
  cardId: string,
  overrides: Partial<Printing> & { type?: string; keywords?: string[] } = {},
): Printing {
  const { type, keywords, ...printingOverrides } = overrides;
  return {
    id,
    cardId,
    shortCode: id,
    setId: "set-1",
    setSlug: "set-alpha",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Artist",
    publicCode: "PUB",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: cardId,
      name: `Card ${cardId}`,
      type: type ?? "unit",
      types: [type ?? "unit"],
      superTypes: [],
      domains: ["fury"],
      energy: 1,
      might: 1,
      power: 1,
      keywords: keywords ?? [],
      tags: [],
      mightBonus: 0,
      maxCopiesOverride: null,
      errata: null,
      bans: [],
    },
    ...printingOverrides,
  };
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
    makePrinting("p2", "c1"), // second printing of c1
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
    expect(byCard.get("c1")).toBe(3); // unit
    expect(byCard.get("c2")).toBe(1); // legend
  });

  it("playset multiplier scales the playset size", () => {
    const rule: ListRule = {
      kind: "wish",
      filter: filters(),
      quantity: { mode: "playset", multiplier: 2 },
      excludeIds: [],
    };
    const out = evaluateListRule(rule, "card", { catalog: [makePrinting("p1", "c1")] });
    expect(out[0]?.quantity).toBe(6); // 3 × 2
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
      makePrinting("p1", "c1", { rarity: "common", finish: "normal" }), // standard
      makePrinting("p2", "c2", { rarity: "common", finish: "foil" }), // non-standard
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
    // c1 is a unit (playset 3); own 1 → want 2. c2 is a legend (playset 1); own 0 → want 1.
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
    // Own a full playset of c1 (3 of its unit) → complete → dropped. c2 legend still wanted.
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
    // Own 1 of p1 → p1 complete (want 1 − 1 = 0, dropped); p2 still wanted.
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
    // The only copy of c1 is reserved (outgoing) → it no longer counts as owned,
    // so the card is still wanted; c2 (legend, none owned) is wanted too.
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
    // Without the assignment map, the custom-tag dimension reads no tags and
    // matches nothing — the bug this guards against.
    expect(evaluateListRule(rule, "card", { catalog })).toEqual([]);
    // With assignments, only the tagged card matches.
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
    // keep cp1 (sorted first), trade cp2 + cp3
    expect(out.map((e) => e.copyId)).toEqual(["cp2", "cp3"]);
  });

  // Reference orders for niceness ranking: plain first, premium last.
  const enumOrders = {
    finishes: ["normal", "foil", "metal"],
    rarities: ["common", "uncommon", "rare"],
    artVariants: ["normal", "altart"],
  };
  // Three printings of the same card. `foil` (common + foil) is the only
  // non-standard one — a foil common is a premium treatment; `rare` + normal
  // finish is that rarity's plain (standard) version.
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
    // Standard-vs-special is the top keep tier: the foil common (special) is
    // kept even over the rare (standard); the standard copies are offered
    // rarest-first.
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

  it("keeps marked copies over unmarked ones of equal rarity and finish", () => {
    // Regression: a promo (marked) foil and a plain foil tie on every ranked
    // dimension, and the promo's later canonicalRank used to sort it into the
    // offer pile. Markers now outrank the tiebreak: 2 foils + 3 promos with
    // keep 3 must keep all promos and offer the foils.
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
    // No niceness signal: keep the lower copy id, offer the rest — the prior behaviour.
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
    // Keep 0 means "offer everything I have", so the reserved copy is still
    // offered even though it sorts to the front of the keep ladder.
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule(), "copy", { catalog, ownedCopies });
    const reserved = out.find((e) => e.copyId === "cp1");
    expect(reserved?.reserved).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("keeps the reserved copy back and offers the available ones", () => {
    // Three copies, one pinned to a live trade. Keeping 1 must hold back the
    // reserved copy, so both offered copies are genuinely available.
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1" }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cp3", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog,
      ownedCopies,
    });
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["cp1", "cp3"]);
  });

  it("reserved outranks printing niceness in the keep ladder", () => {
    // The reserved copy is the plain one and the free copy is the foil
    // (special). Reserved is the top tier, so the plain copy is kept and the
    // nicer foil is offered.
    const ownedCopies = [
      ownedCopy({ copyId: "cpPlain", printingId: "plain", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cpFoil", printingId: "foil", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: nicenessCatalog,
      ownedCopies,
      enumOrders,
    });
    expect(out.map((entry) => entry.copyId)).toEqual(["cpFoil"]);
  });

  it("only trades copies whose printing passes the filter", () => {
    // p1 is a normal finish, p2 is foil; the filter excludes foil, so only the
    // copy of p1 should be traded (proves the filter is applied selectively, not
    // all-or-nothing).
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
    // One card, two printings, keep a playset (3) per printing: 5 copies of pA
    // offer 2, 2 copies of pB offer none. The default per-card grouping would
    // pool all 7 and offer 4.
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
    // 8 copies of a unit (playset 3) → keep 6 (2 playsets), trade 2.
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
    // ADR-034 additive model: total = manual part + rule contribution. The rule
    // part is reported separately via ruleQuantity so the manual part stays
    // independently editable (manual = quantity - ruleQuantity).
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
    // Multiple wish rules can each match the same card (ADR-034). A rule∩rule
    // overlap must NOT be relabelled "both" (that means a manual entry exists),
    // and overlapping rules contribute their max — never the sum.
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
    // manual 1 + max(rule 2, rule 4) = 5.
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
    // Rule 1 matches the legend c1; rule 2 matches the two units c2 and c3. The
    // combined output is the concatenation of both rules' entries.
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
    // Entries arrive pre-combined: one per card, each wanted 2 + 4 = 6.
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
    expect(byCard.get("c2")).toBe(4); // only rule 2 contributes
  });

  it("summed netOwned rules share one owned pool (no double-crediting)", () => {
    // Rules A (want 3, net) + B (want 1, net) on the same card, owning 2:
    // combined demand 4 − owned 2 = 2. Per-rule netting would wrongly give
    // (3−2) + max(0, 1−2) = 1.
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
    // A (want 3, net) + B (want 2, plain), owning 1: B's 2 stand as-is, A nets
    // to 2 → total 4.
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
    // max(3, 1) − 2 owned = 1.
    expect(out).toEqual([
      { kind: "card", cardId: "c1", quantity: 1, acceptablePrintingIds: new Set(["p1"]) },
    ]);
  });
});

describe("evaluateListRules — acceptable printings and filter-aware netting (amendment 3)", () => {
  // One card in two printings: p1 is the plain version, p2 the foil.
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
    // Want 3 non-foil c1; owning two foil copies must not fill the want, while
    // the one plain copy nets as before → shortfall 2.
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
    // Rule A (net, plain-only, want 2) + rule B (plain bucket, foil-only,
    // want 1). The owned foil copy is acceptable to B but must not net A's
    // bucket: total = 1 + max(0, 2 − 0) = 3.
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
    // c1 in a plain and an alt-art foil printing; c2 exists only as a special.
    const specialsCatalog = [
      makePrinting("plain", "c1"),
      makePrinting("alt", "c1", { artVariant: "altart", finish: "foil" }),
      makePrinting("alt-only", "c2", { artVariant: "altart", finish: "foil" }),
    ];

    it("owned special versions fill the shortfall while the acceptable set stays strict", () => {
      // Want 3 standard c1, own 2 alt arts → shortfall 1, but only the plain
      // printing may satisfy the want. Without the flag the alts are invisible.
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
      // c2 has no standard printing, so it must stay off the list even though
      // the relaxed pass matches its alt art.
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
      // The alt art is excluded by its variant, so it must not net the want
      // even with the flag on: only isStandard is cleared, nothing else.
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
      // A specials-only rule ("Standard printings: no") must not have the
      // inverted effect: the owned plain copy stays outside the pool.
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
      // Per-printing netting: the owned alt art nets only its own printing,
      // flag or not — the plain printing's want survives.
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
    // The manual part accepts any printing, so the merged entry is unrestricted.
    expect(both).toMatchObject({ source: "both", acceptablePrintingIds: undefined });
    expect(ruleOnly?.acceptablePrintingIds).toEqual(new Set(["p3"]));
  });
});

describe("evaluateListRules — trade combine (the Zeri matrix)", () => {
  // One card, five owned copies, ranked keep-first:
  //   Z1 foil+signed (special) > Z2 foil (special) > Z3 > Z4 > Z5 (plains).
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
  // Rule A: offer my extras across everything, keep 1 (keeps Z1).
  // Rule B: hold back plains for a second deck, keep 2 (keeps Z3 + Z4).
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
    // Kept: Z1 (rule A) + Z3, Z4 (rule B). Offered: the spare foil + spare plain.
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z5"]);
  });

  it("count-sum: keep 1 + 2 = 3 nicest across the union", () => {
    const out = evaluateListRules(rules, "copy", ctx, "count-sum");
    // Keeps Z1, Z2, Z3 (nicest three), offers Z4 + Z5 — including plains rule B
    // guarded, which is the documented count-mode trade-off.
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
    // Rule B excludes Z5; rule A doesn't match plains here. Z5 must not appear.
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
    // Foil pool keeps Z1, offers Z2; plain pool (minus excluded Z5) keeps Z3,
    // offers Z4.
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z2", "z4"]);
  });

  it("count modes combine within a grouping and union the keeps across them", () => {
    // Rule A keeps 1 per card; rule C keeps 1 of each printing. Counts against
    // different group sizes never add up — each grouping keeps its own nicest,
    // and a copy kept by either stays kept (the protect invariant).
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
      // Card layer keeps Z1; printing layer keeps the nicest of each printing:
      // Z1 (foil-signed), Z2 (foil), Z3 (first plain). Offered: Z4 + Z5.
      expect(out.map((entry) => entry.copyId).sort()).toEqual(["z4", "z5"]);
    }
  });

  it("carries the reserved annotation through combination", () => {
    // Two reserved copies against a keep of one per rule: the ladder holds back
    // Z4, so Z5 is offered and keeps its annotation.
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
    expect(out.map((entry) => entry.copyId).sort()).toEqual(["z1", "z2", "z3", "z5"]);
    expect(out.find((entry) => entry.copyId === "z5")?.reserved).toBe(true);
  });

  it("count modes hold back the reserved copy first", () => {
    // Z5 (a plain) is pinned to a live trade. Reserved is the top tier, so it
    // is the one held back and the nicer free copies are offered.
    const reservedCopies = ownedCopies.map((copy) =>
      copy.copyId === "z5" ? { ...copy, reserved: true } : copy,
    );
    const reservedCtx = { ...ctx, ownedCopies: reservedCopies };
    expect(
      evaluateListRules([rules[0]!], "copy", reservedCtx)
        .map((entry) => entry.copyId)
        .sort(),
    ).toEqual(["z1", "z2", "z3", "z4"]);
    expect(
      evaluateListRules([rules[0]!], "copy", reservedCtx, "count-max")
        .map((entry) => entry.copyId)
        .sort(),
    ).toEqual(["z1", "z2", "z3", "z4"]);
  });
});

describe("listRulesSchema — rule count cap", () => {
  // Each rule runs a full-catalog filter pass at read time (including the
  // uncached anonymous public-share path), so the count is bounded.
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

  // The property the narrowing rests on: dropping the out-of-scope copies must
  // not change what the evaluator produces.
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
        // Not reachable by either rule's filter — must be droppable.
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
    // p1 (1.50) passes, p2 (7) exceeds the max, p3 has no price at all.
    expect(out.map((e) => e.printingId)).toEqual(["p1"]);
  });

  it("the same bound reads a different quote on a different marketplace", () => {
    const out = evaluateListRule(wishUnder(5, "tcgplayer"), "printing", { catalog, priceLookup });
    // p1 is 9 on TCGplayer, so nothing passes.
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
    // Only p2 (7 ≥ 2) passes; p1 is below the min and p3 is price-less.
    expect(out.map((e) => e.copyId)).toEqual(["x2"]);
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
    // Without prices the scope collapses like the evaluation does — the two
    // must never drift, or copy loading would miss what the rules match.
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
