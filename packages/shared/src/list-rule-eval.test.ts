import { describe, expect, it } from "vitest";

import { evaluateListRule, evaluateListRules, expandList } from "./list-rule-eval.js";
import type {
  ExpandedEntry,
  ManualEntryRow,
  OwnedCopyRow,
  VirtualEntry,
} from "./list-rule-eval.js";
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
      superTypes: [],
      domains: ["fury"],
      energy: 1,
      might: 1,
      power: 1,
      keywords: keywords ?? [],
      tags: [],
      mightBonus: 0,
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
    deckbuildingAvailable: true,
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

  it("protects deck-available copies first when choosing what to keep", () => {
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1", deckbuildingAvailable: false }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1", deckbuildingAvailable: true }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog,
      ownedCopies,
    });
    // cp2 (deck-available) is kept; cp1 is traded.
    expect(out.map((e) => e.copyId)).toEqual(["cp1"]);
  });

  // Reference orders for niceness ranking: plain first, premium last.
  const enumOrders = {
    finishes: ["normal", "foil", "metal"],
    rarities: ["common", "uncommon", "rare"],
    artVariants: ["normal", "altart"],
  };
  // Three printings of the same card, ranked plain → nice by the orders above.
  const nicenessCatalog = [
    makePrinting("plain", "c1", { rarity: "common", finish: "normal" }),
    makePrinting("foil", "c1", { rarity: "common", finish: "foil" }),
    makePrinting("rare", "c1", { rarity: "rare", finish: "normal" }),
  ];

  it("keeps the nicer printings and offers the plainer ones", () => {
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
    // Rarity dominates, so the rare copy is kept; foil then plain are offered.
    expect(out.map((entry) => entry.copyId)).toEqual(["cpFoil", "cpPlain"]);
  });

  it("protects deck-available copies ahead of niceness", () => {
    const ownedCopies = [
      ownedCopy({
        copyId: "cpRare",
        printingId: "rare",
        cardId: "c1",
        deckbuildingAvailable: false,
      }),
      ownedCopy({
        copyId: "cpPlain",
        printingId: "plain",
        cardId: "c1",
        deckbuildingAvailable: true,
      }),
    ];
    const out = evaluateListRule(tradeRule({ keepPerCard: { mode: "fixed", n: 1 } }), "copy", {
      catalog: nicenessCatalog,
      ownedCopies,
      enumOrders,
    });
    // The nicer copy is deck-unavailable, so the deck-available plain copy is kept.
    expect(out.map((entry) => entry.copyId)).toEqual(["cpRare"]);
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
    const ownedCopies = [
      ownedCopy({ copyId: "cp1", printingId: "p1", cardId: "c1", reserved: true }),
      ownedCopy({ copyId: "cp2", printingId: "p1", cardId: "c1" }),
    ];
    const out = evaluateListRule(tradeRule(), "copy", { catalog, ownedCopies });
    const reserved = out.find((e) => e.copyId === "cp1");
    expect(reserved?.reserved).toBe(true);
    expect(out).toHaveLength(2);
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

  it("overlapping rules deduplicate to the max quantity via expandList", () => {
    const rules: ListRule[] = [
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 2 }, excludeIds: [] },
      { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 4 }, excludeIds: [] },
    ];
    const ruleEntries = evaluateListRules(rules, "card", { catalog });
    const expanded = expandList("card", [], ruleEntries);
    // Three distinct cards, each wanted at the higher of the two quantities.
    expect(expanded).toHaveLength(3);
    expect(expanded.every((entry) => entry.quantity === 4 && entry.source === "rule")).toBe(true);
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
