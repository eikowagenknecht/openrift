import { describe, expect, it } from "bun:test";

import { filterCards, getAvailableFilters, parseSearchTerms, sortCards } from "./filters";
import type { Card, CardFilters, Printing } from "./types";

// ---------------------------------------------------------------------------
// Helpers — build minimal Printing objects for testing
// ---------------------------------------------------------------------------

function makePrinting(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  const { card: cardOverrides, ...printingOverrides } = overrides;
  const cardId = cardOverrides?.id ?? "00000000-0000-0000-0000-000000000001";
  const cardSlug = cardOverrides?.slug ?? "SET1-001";
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "SET1-001:common:normal:",
    sourceId: "SET1-001",
    set: "Set Alpha",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    images: [{ face: "front", url: "thumb.jpg" }],
    artist: "Jane Doe",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    card: {
      id: cardId,
      slug: cardSlug,
      name: "Test Card",
      type: "Unit",
      superTypes: [],
      domains: ["Fury"],
      energy: 3,
      might: 2,
      power: 4,
      keywords: ["Shield"],
      tags: ["Warrior"],
      mightBonus: 0,
      rulesText: "A test card",
      effectText: "Deal 2 damage",
      ...cardOverrides,
    },
    ...printingOverrides,
  };
}

function emptyFilters(overrides: Partial<CardFilters> = {}): CardFilters {
  return {
    search: "",
    searchScope: ["name"],
    sets: [],
    rarities: [],
    types: [],
    superTypes: [],
    domains: [],
    energy: { min: null, max: null },
    might: { min: null, max: null },
    power: { min: null, max: null },
    price: { min: null, max: null },
    artVariants: [],
    finishes: [],
    isSigned: null,
    isPromo: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseSearchTerms
// ---------------------------------------------------------------------------

describe("parseSearchTerms", () => {
  it("returns empty array for empty string", () => {
    expect(parseSearchTerms("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(parseSearchTerms("   ")).toEqual([]);
  });

  it("parses a bare word as a null-field term", () => {
    expect(parseSearchTerms("dragon")).toEqual([{ field: null, text: "dragon" }]);
  });

  it("parses multiple bare words as separate terms", () => {
    const result = parseSearchTerms("fire dragon");
    expect(result).toEqual([
      { field: null, text: "fire" },
      { field: null, text: "dragon" },
    ]);
  });

  it("parses a quoted phrase as a single null-field term", () => {
    expect(parseSearchTerms('"fire dragon"')).toEqual([{ field: null, text: "fire dragon" }]);
  });

  it("parses name prefix (n:)", () => {
    expect(parseSearchTerms("n:dragon")).toEqual([{ field: "name", text: "dragon" }]);
  });

  it("parses card text prefix (d:)", () => {
    expect(parseSearchTerms("d:damage")).toEqual([{ field: "cardText", text: "damage" }]);
  });

  it("parses keywords prefix (k:)", () => {
    expect(parseSearchTerms("k:shield")).toEqual([{ field: "keywords", text: "shield" }]);
  });

  it("parses tags prefix (t:)", () => {
    expect(parseSearchTerms("t:warrior")).toEqual([{ field: "tags", text: "warrior" }]);
  });

  it("parses artist prefix (a:)", () => {
    expect(parseSearchTerms("a:jane")).toEqual([{ field: "artist", text: "jane" }]);
  });

  it("parses id prefix (id:)", () => {
    expect(parseSearchTerms("id:SET1-001")).toEqual([{ field: "id", text: "SET1-001" }]);
  });

  it("parses prefix with quoted value", () => {
    expect(parseSearchTerms('n:"fire dragon"')).toEqual([{ field: "name", text: "fire dragon" }]);
  });

  it("parses mixed prefixed and bare terms", () => {
    const result = parseSearchTerms("n:dragon fury");
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: null, text: "fury" },
    ]);
  });

  it("ignores empty prefix values", () => {
    // n: with nothing after it — the regex will try to match but get empty
    expect(parseSearchTerms('n:""')).toEqual([]);
  });

  it("handles multiple prefixed terms", () => {
    const result = parseSearchTerms("n:dragon k:shield");
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: "keywords", text: "shield" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// filterCards
// ---------------------------------------------------------------------------

describe("filterCards", () => {
  const printings = [
    makePrinting({
      id: "SET1-001:rare:normal:",
      sourceId: "SET1-001",
      set: "Set Alpha",
      rarity: "Rare",
      artVariant: "normal",
      finish: "normal",
      images: [{ face: "front", url: "t.jpg" }],
      artist: "Alice",
      card: {
        id: "SET1-001",
        name: "Fire Dragon",
        type: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
        energy: 5,
        might: 4,
        power: 6,
        keywords: ["Shield", "Burn"],
        tags: ["Dragon", "Warrior"],
        mightBonus: 0,
        rulesText: "A fiery beast",
        effectText: "Deal 3 damage",
      },
    }),
    makePrinting({
      id: "SET1-002:common:foil:",
      sourceId: "SET1-002",
      set: "Set Alpha",
      rarity: "Common",
      artVariant: "normal",
      finish: "foil",
      images: [{ face: "front", url: "t.jpg" }],
      artist: "Bob",
      card: {
        id: "SET1-002",
        name: "Ice Golem",
        type: "Unit",
        superTypes: [],
        domains: ["Calm"],
        energy: 3,
        might: 6,
        power: 2,
        keywords: ["Freeze"],
        tags: ["Golem"],
        mightBonus: 0,
        rulesText: "A frozen construct",
        effectText: "Freeze target",
      },
    }),
    makePrinting({
      id: "SET2-001:epic:normal:",
      sourceId: "SET2-001a",
      set: "Set Beta",
      rarity: "Epic",
      artVariant: "altart",
      finish: "normal",
      images: [{ face: "front", url: "t.jpg" }],
      artist: "Carol",
      card: {
        id: "SET2-001",
        name: "Mind Weaver",
        type: "Spell",
        superTypes: ["Basic"],
        domains: ["Mind", "Chaos"],
        energy: 2,
        might: 0,
        power: 0,
        keywords: [],
        tags: ["Psychic"],
        mightBonus: 0,
        rulesText: "Manipulate thoughts",
        effectText: "Draw 2 cards",
      },
    }),
  ];

  it("returns all printings when filters are empty", () => {
    const result = filterCards(printings, emptyFilters());
    expect(result).toHaveLength(3);
  });

  // -- Search --

  it("filters by bare search term using default scope (name)", () => {
    const result = filterCards(printings, emptyFilters({ search: "dragon" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("bare search is case-insensitive", () => {
    const result = filterCards(printings, emptyFilters({ search: "DRAGON" }));
    expect(result).toHaveLength(1);
  });

  it("searches across all scope fields when multiple scopes set", () => {
    const result = filterCards(
      printings,
      emptyFilters({ search: "warrior", searchScope: ["name", "tags"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("prefixed search targets specific field", () => {
    const result = filterCards(printings, emptyFilters({ search: "k:shield" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("un-prefixed terms search all fields when mixed with prefixed terms", () => {
    // "k:freeze golem" — k:freeze matches Ice Golem, and "golem" must also match
    // Since there's a prefix, un-prefixed "golem" searches ALL fields
    const result = filterCards(printings, emptyFilters({ search: "k:freeze golem" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  it("all search terms must match (AND semantics)", () => {
    const result = filterCards(printings, emptyFilters({ search: "n:fire n:golem" }));
    expect(result).toHaveLength(0);
  });

  it("search by artist prefix", () => {
    const result = filterCards(printings, emptyFilters({ search: "a:alice" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("search by id prefix matches sourceId", () => {
    const result = filterCards(printings, emptyFilters({ search: "id:SET2" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("search by card text prefix matches description", () => {
    const result = filterCards(printings, emptyFilters({ search: "d:fiery" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("search by card text prefix matches effect", () => {
    const result = filterCards(printings, emptyFilters({ search: "d:draw" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("search by tags prefix", () => {
    const result = filterCards(printings, emptyFilters({ search: "t:psychic" }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  // -- Set filter --

  it("filters by set", () => {
    const result = filterCards(printings, emptyFilters({ sets: ["Set Beta"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("filters by multiple sets (OR)", () => {
    const result = filterCards(printings, emptyFilters({ sets: ["Set Alpha", "Set Beta"] }));
    expect(result).toHaveLength(3);
  });

  // -- Rarity filter --

  it("filters by rarity", () => {
    const result = filterCards(printings, emptyFilters({ rarities: ["Common"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  it("filters by multiple rarities (OR)", () => {
    const result = filterCards(printings, emptyFilters({ rarities: ["Rare", "Epic"] }));
    expect(result).toHaveLength(2);
  });

  // -- Type filter --

  it("filters by card type", () => {
    const result = filterCards(printings, emptyFilters({ types: ["Spell"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  // -- SuperType filter --

  it("filters by superType", () => {
    const result = filterCards(printings, emptyFilters({ superTypes: ["Champion"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("printings with no matching superType are excluded", () => {
    const result = filterCards(printings, emptyFilters({ superTypes: ["Champion"] }));
    expect(result.find((p) => p.card.name === "Ice Golem")).toBeUndefined();
  });

  // -- Domain filter --

  it("filters by domain", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["Fury"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("matches multi-domain printings", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["Chaos"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("matches either domain of a multi-domain card", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["Mind"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  // -- Stat range filters --

  it("filters by energy min", () => {
    const result = filterCards(printings, emptyFilters({ energy: { min: 4, max: null } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("filters by energy max", () => {
    const result = filterCards(printings, emptyFilters({ energy: { min: null, max: 2 } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("filters by energy range", () => {
    const result = filterCards(printings, emptyFilters({ energy: { min: 3, max: 5 } }));
    expect(result).toHaveLength(2); // Fire Dragon (5) and Ice Golem (3)
  });

  it("filters by might min", () => {
    const result = filterCards(printings, emptyFilters({ might: { min: 5, max: null } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  it("filters by power min", () => {
    const result = filterCards(printings, emptyFilters({ power: { min: 3, max: null } }));
    expect(result).toHaveLength(1); // Fire Dragon (6)
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("filters by power max", () => {
    const result = filterCards(printings, emptyFilters({ power: { min: null, max: 3 } }));
    expect(result).toHaveLength(2); // Ice Golem (2), Mind Weaver (0)
  });

  it("filters by might max", () => {
    const result = filterCards(printings, emptyFilters({ might: { min: null, max: 3 } }));
    expect(result).toHaveLength(1); // Mind Weaver (0)
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  // -- Art variant filter --

  it("filters by artVariant", () => {
    const result = filterCards(printings, emptyFilters({ artVariants: ["altart"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("filters by multiple artVariants (OR)", () => {
    const result = filterCards(printings, emptyFilters({ artVariants: ["normal", "altart"] }));
    expect(result).toHaveLength(3);
  });

  // -- Finish filter --

  it("filters by finish", () => {
    const result = filterCards(printings, emptyFilters({ finishes: ["foil"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  // -- isSigned filter --

  it("filters by isSigned", () => {
    const withSigned = [
      makePrinting({
        isSigned: true,
        card: {
          id: "s",
          name: "Signed Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        isSigned: false,
        card: {
          id: "u",
          name: "Unsigned Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    const result = filterCards(withSigned, emptyFilters({ isSigned: true }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Signed Card");
  });

  // -- isPromo filter --

  it("filters by isPromo", () => {
    const withPromo = [
      makePrinting({
        isPromo: true,
        card: {
          id: "p",
          name: "Promo Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        isPromo: false,
        card: {
          id: "r",
          name: "Regular Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    const result = filterCards(withPromo, emptyFilters({ isPromo: true }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Promo Card");
  });

  // -- Price filter --

  it("excludes printings with null price when price filter is active", () => {
    // All our test printings have no price set
    const result = filterCards(printings, emptyFilters({ price: { min: 0, max: null } }));
    expect(result).toHaveLength(0);
  });

  it("filters by price range", () => {
    const withPrices = [
      makePrinting({
        marketPrice: 1,
        card: {
          id: "c",
          name: "Cheap Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        marketPrice: 25,
        card: {
          id: "e",
          name: "Expensive Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        card: {
          id: "n",
          name: "No Price Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
    ];

    const result = filterCards(withPrices, emptyFilters({ price: { min: 5, max: 30 } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Expensive Card");
  });

  // -- Combined filters --

  it("combines multiple filters (AND across dimensions)", () => {
    const result = filterCards(
      printings,
      emptyFilters({
        sets: ["Set Alpha"],
        rarities: ["Common"],
        types: ["Unit"],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  it("returns empty array when no printing matches all filters", () => {
    const result = filterCards(
      printings,
      emptyFilters({
        sets: ["Set Beta"],
        rarities: ["Common"],
      }),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getAvailableFilters
// ---------------------------------------------------------------------------

describe("getAvailableFilters", () => {
  const printings = [
    makePrinting({
      rarity: "Epic",
      set: "Set Alpha",
      artVariant: "altart",
      finish: "normal",
      card: {
        id: "1",
        name: "Test",
        type: "Spell",
        superTypes: ["Basic"],
        domains: ["Mind", "Chaos"],
        energy: 2,
        might: 0,
        power: 0,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
    makePrinting({
      rarity: "Common",
      set: "Set Beta",
      artVariant: "normal",
      finish: "normal",
      card: {
        id: "2",
        name: "Test2",
        type: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
        energy: 5,
        might: 4,
        power: 6,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
    makePrinting({
      rarity: "Rare",
      set: "Set Alpha",
      artVariant: "normal",
      finish: "foil",
      card: {
        id: "3",
        name: "Test3",
        type: "Unit",
        superTypes: [],
        domains: ["Colorless"],
        energy: 3,
        might: 2,
        power: 3,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
  ];

  it("collects unique sets preserving order of appearance", () => {
    const result = getAvailableFilters(printings);
    expect(result.sets).toEqual(["Set Alpha", "Set Beta"]);
  });

  it("sorts rarities by RARITY_ORDER", () => {
    const result = getAvailableFilters(printings);
    expect(result.rarities).toEqual(["Common", "Rare", "Epic"]);
  });

  it("sorts types alphabetically", () => {
    const result = getAvailableFilters(printings);
    expect(result.types).toEqual(["Spell", "Unit"]);
  });

  it("excludes Basic from superTypes", () => {
    const result = getAvailableFilters(printings);
    expect(result.superTypes).not.toContain("Basic");
    expect(result.superTypes).toContain("Champion");
  });

  it("sorts Colorless last in domains", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains.at(-1)).toBe("Colorless");
  });

  it("lists individual domains from multi-domain cards", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains).toContain("Mind");
    expect(result.domains).toContain("Chaos");
  });

  it("sorts artVariants in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.artVariants).toEqual(["normal", "altart"]);
  });

  it("sorts finishes in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.finishes).toEqual(["normal", "foil"]);
  });

  it("computes correct stat ranges", () => {
    const result = getAvailableFilters(printings);
    expect(result.energy).toEqual({ min: 2, max: 5 });
    expect(result.might).toEqual({ min: 0, max: 4 });
    expect(result.power).toEqual({ min: 0, max: 6 });
  });

  it("computes price range from printings with prices", () => {
    const withPrices = [makePrinting({ marketPrice: 2.5 }), makePrinting({ marketPrice: 25.3 })];
    const result = getAvailableFilters(withPrices);
    expect(result.price).toEqual({ min: 2, max: 26 }); // floor(2.5), ceil(25.3)
  });

  it("returns 0 price range when no printings have prices", () => {
    const result = getAvailableFilters([makePrinting()]);
    expect(result.price).toEqual({ min: 0, max: 0 });
  });

  it("computes hasSigned when signed printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({ isSigned: true }),
      makePrinting({ isSigned: false }),
    ]);
    expect(result.hasSigned).toBe(true);
  });

  it("computes hasSigned false when no signed printings", () => {
    const result = getAvailableFilters([makePrinting({ isSigned: false })]);
    expect(result.hasSigned).toBe(false);
  });

  it("handles empty array", () => {
    const result = getAvailableFilters([]);
    expect(result.sets).toEqual([]);
    expect(result.rarities).toEqual([]);
    expect(result.types).toEqual([]);
    expect(result.superTypes).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.artVariants).toEqual([]);
    expect(result.finishes).toEqual([]);
    expect(result.energy).toEqual({ min: 0, max: 0 });
    expect(result.price).toEqual({ min: 0, max: 0 });
    expect(result.hasSigned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortCards
// ---------------------------------------------------------------------------

describe("sortCards", () => {
  const printings = [
    makePrinting({
      id: "SET1-003:epic:normal:",
      sourceId: "SET1-003",
      rarity: "Epic",
      card: {
        id: "SET1-003",
        name: "Charlie",
        type: "Unit",
        superTypes: [],
        domains: [],
        energy: 5,
        might: 0,
        power: 0,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
    makePrinting({
      id: "SET1-001:rare:normal:",
      sourceId: "SET1-001",
      rarity: "Common",
      card: {
        id: "SET1-001",
        name: "Alpha",
        type: "Unit",
        superTypes: [],
        domains: [],
        energy: 2,
        might: 0,
        power: 0,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
    makePrinting({
      id: "SET1-002:common:foil:",
      sourceId: "SET1-002",
      rarity: "Rare",
      card: {
        id: "SET1-002",
        name: "Bravo",
        type: "Unit",
        superTypes: [],
        domains: [],
        energy: 2,
        might: 0,
        power: 0,
        keywords: [],
        tags: [],
        mightBonus: null,
        rulesText: "",
        effectText: "",
      },
    }),
  ];

  it("does not mutate the original array", () => {
    const original = [...printings];
    sortCards(printings, "name");
    expect(printings).toEqual(original);
  });

  it("sorts by name alphabetically", () => {
    const result = sortCards(printings, "name");
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by id (sourceId string comparison)", () => {
    const result = sortCards(printings, "id");
    expect(result.map((p) => p.sourceId)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
  });

  it("sorts by energy, breaking ties by name", () => {
    const result = sortCards(printings, "energy");
    // Alpha(2) and Bravo(2) tied → alphabetical; then Charlie(5)
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by rarity using RARITY_ORDER, breaking ties by name", () => {
    const result = sortCards(printings, "rarity");
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  describe("price sort", () => {
    const pricePrintings = [
      makePrinting({
        marketPrice: 20,
        card: {
          id: "e",
          name: "Expensive",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        card: {
          id: "n",
          name: "No Price",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        marketPrice: 1,
        card: {
          id: "c",
          name: "Cheap",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          rulesText: "",
          effectText: "",
        },
      }),
    ];

    it("sorts by price ascending, nulls last", () => {
      const result = sortCards(pricePrintings, "price");
      expect(result.map((p) => p.card.name)).toEqual(["Cheap", "Expensive", "No Price"]);
    });

    it("breaks price ties by name", () => {
      const tiedPrintings = [
        makePrinting({
          marketPrice: 5,
          card: {
            id: "b",
            name: "Bravo",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            rulesText: "",
            effectText: "",
          },
        }),
        makePrinting({
          marketPrice: 5,
          card: {
            id: "a",
            name: "Alpha",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            rulesText: "",
            effectText: "",
          },
        }),
      ];
      const result = sortCards(tiedPrintings, "price");
      expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo"]);
    });

    it("sorts all-null-price printings by name", () => {
      const nullPrintings = [
        makePrinting({
          card: {
            id: "z",
            name: "Zed",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            rulesText: "",
            effectText: "",
          },
        }),
        makePrinting({
          card: {
            id: "a",
            name: "Amy",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            rulesText: "",
            effectText: "",
          },
        }),
      ];
      const result = sortCards(nullPrintings, "price");
      expect(result.map((p) => p.card.name)).toEqual(["Amy", "Zed"]);
    });
  });
});
