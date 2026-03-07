import { describe, expect, it } from "bun:test";

import {
  filterCards,
  getAvailableFilters,
  getMarketPrice,
  parseSearchTerms,
  sortCards,
} from "./filters";
import type { Card, CardFilters } from "./types";

// ---------------------------------------------------------------------------
// Helpers — build minimal Card objects for testing
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "SET1-001:normal:::",
    cardId: "SET1-001",
    sourceId: "SET1-001",
    name: "Test Card",
    type: "Unit",
    superTypes: [],
    rarity: "Common",
    collectorNumber: 1,
    domains: ["Fury"],
    stats: { energy: 3, might: 2, power: 4 },
    keywords: ["Shield"],
    description: "A test card",
    effect: "Deal 2 damage",
    mightBonus: 0,
    set: "Set Alpha",
    art: { imageURL: "thumb.jpg", artist: "Jane Doe" },
    tags: ["Warrior"],
    publicCode: "ABCD",
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    ...overrides,
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
    energyMin: null,
    energyMax: null,
    mightMin: null,
    mightMax: null,
    powerMin: null,
    powerMax: null,
    priceMin: null,
    priceMax: null,
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
// getMarketPrice
// ---------------------------------------------------------------------------

describe("getMarketPrice", () => {
  it("returns market price when available", () => {
    const card = makeCard({
      price: {
        productId: 1,

        low: 1,
        mid: 2,
        high: 3,
        market: 2.5,
      },
    });
    expect(getMarketPrice(card)).toBe(2.5);
  });

  it("returns null when no price data exists", () => {
    const card = makeCard();
    expect(getMarketPrice(card)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterCards
// ---------------------------------------------------------------------------

describe("filterCards", () => {
  const cards = [
    makeCard({
      id: "SET1-001:normal:::normal",
      cardId: "SET1-001",
      sourceId: "SET1-001",
      name: "Fire Dragon",
      type: "Unit",
      rarity: "Rare",
      domains: ["Fury"],
      set: "Set Alpha",
      stats: { energy: 5, might: 4, power: 6 },
      keywords: ["Shield", "Burn"],
      description: "A fiery beast",
      effect: "Deal 3 damage",
      tags: ["Dragon", "Warrior"],
      superTypes: ["Elite"],
      artVariant: "normal",
      finish: "normal",
      art: { imageURL: "t.jpg", artist: "Alice" },
    }),
    makeCard({
      id: "SET1-002:normal:::normal",
      cardId: "SET1-002",
      sourceId: "SET1-002",
      name: "Ice Golem",
      type: "Unit",
      rarity: "Common",
      domains: ["Calm"],
      set: "Set Alpha",
      stats: { energy: 3, might: 6, power: 2 },
      keywords: ["Freeze"],
      description: "A frozen construct",
      effect: "Freeze target",
      tags: ["Golem"],
      superTypes: [],
      artVariant: "normal",
      finish: "foil",
      art: { imageURL: "t.jpg", artist: "Bob" },
    }),
    makeCard({
      id: "SET2-001:altart:::normal",
      cardId: "SET2-001",
      sourceId: "SET2-001a",
      name: "Mind Weaver",
      type: "Spell",
      rarity: "Epic",
      domains: ["Mind", "Chaos"],
      set: "Set Beta",
      stats: { energy: 2, might: 0, power: 0 },
      keywords: [],
      description: "Manipulate thoughts",
      effect: "Draw 2 cards",
      tags: ["Psychic"],
      superTypes: ["Basic"],
      artVariant: "altart",
      finish: "normal",
      art: { imageURL: "t.jpg", artist: "Carol" },
    }),
  ];

  it("returns all cards when filters are empty", () => {
    const result = filterCards(cards, emptyFilters());
    expect(result).toHaveLength(3);
  });

  // -- Search --

  it("filters by bare search term using default scope (name)", () => {
    const result = filterCards(cards, emptyFilters({ search: "dragon" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("bare search is case-insensitive", () => {
    const result = filterCards(cards, emptyFilters({ search: "DRAGON" }));
    expect(result).toHaveLength(1);
  });

  it("searches across all scope fields when multiple scopes set", () => {
    const result = filterCards(
      cards,
      emptyFilters({ search: "warrior", searchScope: ["name", "tags"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("prefixed search targets specific field", () => {
    const result = filterCards(cards, emptyFilters({ search: "k:shield" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("un-prefixed terms search all fields when mixed with prefixed terms", () => {
    // "k:freeze golem" — k:freeze matches Ice Golem, and "golem" must also match
    // Since there's a prefix, un-prefixed "golem" searches ALL fields
    const result = filterCards(cards, emptyFilters({ search: "k:freeze golem" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ice Golem");
  });

  it("all search terms must match (AND semantics)", () => {
    const result = filterCards(cards, emptyFilters({ search: "n:fire n:golem" }));
    expect(result).toHaveLength(0);
  });

  it("search by artist prefix", () => {
    const result = filterCards(cards, emptyFilters({ search: "a:alice" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("search by id prefix matches sourceId", () => {
    const result = filterCards(cards, emptyFilters({ search: "id:SET2" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("search by card text prefix matches description", () => {
    const result = filterCards(cards, emptyFilters({ search: "d:fiery" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("search by card text prefix matches effect", () => {
    const result = filterCards(cards, emptyFilters({ search: "d:draw" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("search by tags prefix", () => {
    const result = filterCards(cards, emptyFilters({ search: "t:psychic" }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  // -- Set filter --

  it("filters by set", () => {
    const result = filterCards(cards, emptyFilters({ sets: ["Set Beta"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("filters by multiple sets (OR)", () => {
    const result = filterCards(cards, emptyFilters({ sets: ["Set Alpha", "Set Beta"] }));
    expect(result).toHaveLength(3);
  });

  // -- Rarity filter --

  it("filters by rarity", () => {
    const result = filterCards(cards, emptyFilters({ rarities: ["Common"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ice Golem");
  });

  it("filters by multiple rarities (OR)", () => {
    const result = filterCards(cards, emptyFilters({ rarities: ["Rare", "Epic"] }));
    expect(result).toHaveLength(2);
  });

  // -- Type filter --

  it("filters by card type", () => {
    const result = filterCards(cards, emptyFilters({ types: ["Spell"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  // -- SuperType filter --

  it("filters by superType", () => {
    const result = filterCards(cards, emptyFilters({ superTypes: ["Elite"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("cards with no matching superType are excluded", () => {
    const result = filterCards(cards, emptyFilters({ superTypes: ["Elite"] }));
    expect(result.find((c) => c.name === "Ice Golem")).toBeUndefined();
  });

  // -- Domain filter --

  it("filters by domain", () => {
    const result = filterCards(cards, emptyFilters({ domains: ["Fury"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("matches multi-domain cards", () => {
    const result = filterCards(cards, emptyFilters({ domains: ["Chaos"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("matches either domain of a multi-domain card", () => {
    const result = filterCards(cards, emptyFilters({ domains: ["Mind"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  // -- Stat range filters --

  it("filters by energyMin", () => {
    const result = filterCards(cards, emptyFilters({ energyMin: 4 }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("filters by energyMax", () => {
    const result = filterCards(cards, emptyFilters({ energyMax: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("filters by energy range", () => {
    const result = filterCards(cards, emptyFilters({ energyMin: 3, energyMax: 5 }));
    expect(result).toHaveLength(2); // Fire Dragon (5) and Ice Golem (3)
  });

  it("filters by mightMin", () => {
    const result = filterCards(cards, emptyFilters({ mightMin: 5 }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ice Golem");
  });

  it("filters by powerMin", () => {
    const result = filterCards(cards, emptyFilters({ powerMin: 3 }));
    expect(result).toHaveLength(1); // Fire Dragon (6)
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("filters by powerMax", () => {
    const result = filterCards(cards, emptyFilters({ powerMax: 3 }));
    expect(result).toHaveLength(2); // Ice Golem (2), Mind Weaver (0)
  });

  it("filters by mightMax", () => {
    const result = filterCards(cards, emptyFilters({ mightMax: 3 }));
    expect(result).toHaveLength(1); // Mind Weaver (0)
    expect(result[0].name).toBe("Mind Weaver");
  });

  // -- Art variant filter --

  it("filters by artVariant", () => {
    const result = filterCards(cards, emptyFilters({ artVariants: ["altart"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("filters by multiple artVariants (OR)", () => {
    const result = filterCards(cards, emptyFilters({ artVariants: ["normal", "altart"] }));
    expect(result).toHaveLength(3);
  });

  // -- Finish filter --

  it("filters by finish", () => {
    const result = filterCards(cards, emptyFilters({ finishes: ["foil"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ice Golem");
  });

  // -- isSigned filter --

  it("filters by isSigned", () => {
    const cardsWithSigned = [
      makeCard({ name: "Signed Card", isSigned: true }),
      makeCard({ name: "Unsigned Card", isSigned: false }),
    ];
    const result = filterCards(cardsWithSigned, emptyFilters({ isSigned: true }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Signed Card");
  });

  // -- isPromo filter --

  it("filters by isPromo", () => {
    const cardsWithPromo = [
      makeCard({ name: "Promo Card", isPromo: true }),
      makeCard({ name: "Regular Card", isPromo: false }),
    ];
    const result = filterCards(cardsWithPromo, emptyFilters({ isPromo: true }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Promo Card");
  });

  // -- Price filter --

  it("excludes cards with null price when price filter is active", () => {
    // All our test cards have no price set
    const result = filterCards(cards, emptyFilters({ priceMin: 0 }));
    expect(result).toHaveLength(0);
  });

  it("filters by price range", () => {
    const cardsWithPrices = [
      makeCard({
        name: "Cheap Card",
        price: {
          productId: 1,

          low: 0.5,
          mid: 1,
          high: 2,
          market: 1,
        },
      }),
      makeCard({
        name: "Expensive Card",
        price: {
          productId: 2,

          low: 10,
          mid: 20,
          high: 30,
          market: 25,
        },
      }),
      makeCard({ name: "No Price Card" }),
    ];

    const result = filterCards(cardsWithPrices, emptyFilters({ priceMin: 5, priceMax: 30 }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Expensive Card");
  });

  // -- Combined filters --

  it("combines multiple filters (AND across dimensions)", () => {
    const result = filterCards(
      cards,
      emptyFilters({
        sets: ["Set Alpha"],
        rarities: ["Common"],
        types: ["Unit"],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ice Golem");
  });

  it("returns empty array when no card matches all filters", () => {
    const result = filterCards(
      cards,
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
  const cards = [
    makeCard({
      rarity: "Epic",
      type: "Spell",
      domains: ["Mind", "Chaos"],
      superTypes: ["Basic"],
      stats: { energy: 2, might: 0, power: 0 },
      set: "Set Alpha",
      artVariant: "altart",
      finish: "normal",
    }),
    makeCard({
      rarity: "Common",
      type: "Unit",
      domains: ["Fury"],
      superTypes: ["Elite"],
      stats: { energy: 5, might: 4, power: 6 },
      set: "Set Beta",
      artVariant: "normal",
      finish: "normal",
    }),
    makeCard({
      rarity: "Rare",
      type: "Unit",
      domains: ["Colorless"],
      superTypes: [],
      stats: { energy: 3, might: 2, power: 3 },
      set: "Set Alpha",
      artVariant: "normal",
      finish: "foil",
    }),
  ];

  it("collects unique sets preserving order of appearance", () => {
    const result = getAvailableFilters(cards);
    expect(result.sets).toEqual(["Set Alpha", "Set Beta"]);
  });

  it("sorts rarities by RARITY_ORDER", () => {
    const result = getAvailableFilters(cards);
    expect(result.rarities).toEqual(["Common", "Rare", "Epic"]);
  });

  it("sorts types alphabetically", () => {
    const result = getAvailableFilters(cards);
    expect(result.types).toEqual(["Spell", "Unit"]);
  });

  it("excludes Basic from superTypes", () => {
    const result = getAvailableFilters(cards);
    expect(result.superTypes).not.toContain("Basic");
    expect(result.superTypes).toContain("Elite");
  });

  it("sorts Colorless last in domains", () => {
    const result = getAvailableFilters(cards);
    expect(result.domains.at(-1)).toBe("Colorless");
  });

  it("lists individual domains from multi-domain cards", () => {
    const result = getAvailableFilters(cards);
    expect(result.domains).toContain("Mind");
    expect(result.domains).toContain("Chaos");
  });

  it("sorts artVariants in canonical order", () => {
    const result = getAvailableFilters(cards);
    expect(result.artVariants).toEqual(["normal", "altart"]);
  });

  it("sorts finishes in canonical order", () => {
    const result = getAvailableFilters(cards);
    expect(result.finishes).toEqual(["normal", "foil"]);
  });

  it("computes correct stat ranges", () => {
    const result = getAvailableFilters(cards);
    expect(result.energyMin).toBe(2);
    expect(result.energyMax).toBe(5);
    expect(result.mightMin).toBe(0);
    expect(result.mightMax).toBe(4);
    expect(result.powerMin).toBe(0);
    expect(result.powerMax).toBe(6);
  });

  it("computes price range from cards with prices", () => {
    const cardsWithPrices = [
      makeCard({
        price: {
          productId: 1,

          low: 1,
          mid: 2,
          high: 3,
          market: 2.5,
        },
      }),
      makeCard({
        price: {
          productId: 2,

          low: 10,
          mid: 20,
          high: 30,
          market: 25.3,
        },
      }),
    ];
    const result = getAvailableFilters(cardsWithPrices);
    expect(result.priceMin).toBe(2); // floor(2.5)
    expect(result.priceMax).toBe(26); // ceil(25.3)
  });

  it("returns 0 price range when no cards have prices", () => {
    const result = getAvailableFilters([makeCard()]);
    expect(result.priceMin).toBe(0);
    expect(result.priceMax).toBe(0);
  });

  it("computes hasSigned when signed cards exist", () => {
    const result = getAvailableFilters([
      makeCard({ isSigned: true }),
      makeCard({ isSigned: false }),
    ]);
    expect(result.hasSigned).toBe(true);
  });

  it("computes hasSigned false when no signed cards", () => {
    const result = getAvailableFilters([makeCard({ isSigned: false })]);
    expect(result.hasSigned).toBe(false);
  });

  it("computes hasPromo when promo cards exist", () => {
    const result = getAvailableFilters([makeCard({ isPromo: true }), makeCard({ isPromo: false })]);
    expect(result.hasPromo).toBe(true);
  });

  it("computes hasPromo false when no promo cards", () => {
    const result = getAvailableFilters([makeCard({ isPromo: false })]);
    expect(result.hasPromo).toBe(false);
  });

  it("handles empty card array", () => {
    const result = getAvailableFilters([]);
    expect(result.sets).toEqual([]);
    expect(result.rarities).toEqual([]);
    expect(result.types).toEqual([]);
    expect(result.superTypes).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.artVariants).toEqual([]);
    expect(result.finishes).toEqual([]);
    expect(result.energyMin).toBe(0);
    expect(result.energyMax).toBe(0);
    expect(result.priceMin).toBe(0);
    expect(result.priceMax).toBe(0);
    expect(result.hasSigned).toBe(false);
    expect(result.hasPromo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortCards
// ---------------------------------------------------------------------------

describe("sortCards", () => {
  const cards = [
    makeCard({
      id: "SET1-003:normal:::normal",
      sourceId: "SET1-003",
      name: "Charlie",
      rarity: "Epic",
      stats: { energy: 5, might: 0, power: 0 },
    }),
    makeCard({
      id: "SET1-001:normal:::normal",
      sourceId: "SET1-001",
      name: "Alpha",
      rarity: "Common",
      stats: { energy: 2, might: 0, power: 0 },
    }),
    makeCard({
      id: "SET1-002:normal:::normal",
      sourceId: "SET1-002",
      name: "Bravo",
      rarity: "Rare",
      stats: { energy: 2, might: 0, power: 0 },
    }),
  ];

  it("does not mutate the original array", () => {
    const original = [...cards];
    sortCards(cards, "name");
    expect(cards).toEqual(original);
  });

  it("sorts by name alphabetically", () => {
    const result = sortCards(cards, "name");
    expect(result.map((c) => c.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by id (sourceId string comparison)", () => {
    const result = sortCards(cards, "id");
    expect(result.map((c) => c.sourceId)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
  });

  it("sorts by energy, breaking ties by name", () => {
    const result = sortCards(cards, "energy");
    // Alpha(2) and Bravo(2) tied → alphabetical; then Charlie(5)
    expect(result.map((c) => c.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by rarity using RARITY_ORDER, breaking ties by name", () => {
    const result = sortCards(cards, "rarity");
    expect(result.map((c) => c.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  describe("price sort", () => {
    const priceCards = [
      makeCard({
        name: "Expensive",
        price: {
          productId: 1,

          low: 1,
          mid: 2,
          high: 3,
          market: 20,
        },
      }),
      makeCard({ name: "No Price" }),
      makeCard({
        name: "Cheap",
        price: {
          productId: 2,

          low: 1,
          mid: 2,
          high: 3,
          market: 1,
        },
      }),
    ];

    it("sorts by price ascending, nulls last", () => {
      const result = sortCards(priceCards, "price");
      expect(result.map((c) => c.name)).toEqual(["Cheap", "Expensive", "No Price"]);
    });

    it("breaks price ties by name", () => {
      const tiedCards = [
        makeCard({
          name: "Bravo",
          price: {
            productId: 1,

            low: 1,
            mid: 2,
            high: 3,
            market: 5,
          },
        }),
        makeCard({
          name: "Alpha",
          price: {
            productId: 2,

            low: 1,
            mid: 2,
            high: 3,
            market: 5,
          },
        }),
      ];
      const result = sortCards(tiedCards, "price");
      expect(result.map((c) => c.name)).toEqual(["Alpha", "Bravo"]);
    });

    it("sorts all-null-price cards by name", () => {
      const nullCards = [makeCard({ name: "Zed" }), makeCard({ name: "Amy" })];
      const result = sortCards(nullCards, "price");
      expect(result.map((c) => c.name)).toEqual(["Amy", "Zed"]);
    });
  });
});
