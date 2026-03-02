import { describe, expect, it } from "bun:test";

import {
  filterCards,
  flattenWithVariants,
  getAvailableFilters,
  getCardVariant,
  getMarketPrice,
  parseSearchTerms,
  sortCards,
} from "./filters";
import type { Card, CardFilters, RiftboundContent } from "./types";

// ---------------------------------------------------------------------------
// Helpers — build minimal Card objects for testing
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "SET1-001",
    name: "Test Card",
    type: "Unit",
    superTypes: [],
    rarity: "Common",
    collectorNumber: 1,
    faction: "Fury",
    stats: { energy: 3, might: 2, power: 4 },
    keywords: ["Shield"],
    description: "A test card",
    effect: "Deal 2 damage",
    mightBonus: 0,
    set: "Set Alpha",
    art: { thumbnailURL: "thumb.jpg", fullURL: "full.jpg", artist: "Jane Doe" },
    tags: ["Warrior"],
    orientation: "portrait",
    publicCode: "ABCD",
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
    variants: [],
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
  it("returns normal market price when available", () => {
    const card = makeCard({
      price: {
        productId: 1,
        url: null,
        normal: { low: 1, mid: 2, high: 3, market: 2.5, directLow: null },
        foil: { low: 5, mid: 6, high: 7, market: 6.5, directLow: null },
      },
    });
    expect(getMarketPrice(card)).toBe(2.5);
  });

  it("falls back to foil market price when normal is absent", () => {
    const card = makeCard({
      price: {
        productId: 1,
        url: null,
        foil: { low: 5, mid: 6, high: 7, market: 6.5, directLow: null },
      },
    });
    expect(getMarketPrice(card)).toBe(6.5);
  });

  it("returns null when no price data exists", () => {
    const card = makeCard();
    expect(getMarketPrice(card)).toBeNull();
  });

  it("returns null when price object exists but has neither normal nor foil", () => {
    const card = makeCard({ price: { productId: 1, url: null } });
    expect(getMarketPrice(card)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCardVariant
// ---------------------------------------------------------------------------

describe("getCardVariant", () => {
  it('returns "Signed" when id ends with *', () => {
    const card = makeCard({ id: "SET1-001*" });
    expect(getCardVariant(card, 100)).toBe("Signed");
  });

  it('returns "Alt Art" when id ends with a lowercase letter', () => {
    const card = makeCard({ id: "SET1-001a" });
    expect(getCardVariant(card, 100)).toBe("Alt Art");
  });

  it('returns "Overnumbered" when collectorNumber exceeds totalCards', () => {
    const card = makeCard({ id: "SET1-150", collectorNumber: 150 });
    expect(getCardVariant(card, 100)).toBe("Overnumbered");
  });

  it('returns "Normal" for a standard card', () => {
    const card = makeCard({ id: "SET1-050", collectorNumber: 50 });
    expect(getCardVariant(card, 100)).toBe("Normal");
  });

  it('returns "Normal" when collectorNumber equals totalCards', () => {
    const card = makeCard({ id: "SET1-100", collectorNumber: 100 });
    expect(getCardVariant(card, 100)).toBe("Normal");
  });

  it("Signed takes priority over lowercase trailing letter", () => {
    // id ends with * which is checked first
    const card = makeCard({ id: "SET1-001a*", collectorNumber: 1 });
    expect(getCardVariant(card, 100)).toBe("Signed");
  });
});

// ---------------------------------------------------------------------------
// flattenWithVariants
// ---------------------------------------------------------------------------

describe("flattenWithVariants", () => {
  it("flattens sets into a single card array with variants", () => {
    const content: RiftboundContent = {
      game: "Riftbound",
      version: "1.0",
      lastUpdated: "2025-01-01",
      sets: [
        {
          id: "set1",
          name: "Set Alpha",
          totalCards: 2,
          cards: [
            makeCard({ id: "SET1-001", collectorNumber: 1 }),
            makeCard({ id: "SET1-002", collectorNumber: 2 }),
          ],
        },
        {
          id: "set2",
          name: "Set Beta",
          totalCards: 1,
          cards: [makeCard({ id: "SET2-001", collectorNumber: 1 })],
        },
      ],
    };

    const result = flattenWithVariants(content);
    expect(result).toHaveLength(3);
    expect(result[0].variant).toBe("Normal");
    expect(result[1].variant).toBe("Normal");
    expect(result[2].variant).toBe("Normal");
  });

  it("assigns correct variants based on set totalCards", () => {
    const content: RiftboundContent = {
      game: "Riftbound",
      version: "1.0",
      lastUpdated: "2025-01-01",
      sets: [
        {
          id: "set1",
          name: "Set Alpha",
          totalCards: 2,
          cards: [
            makeCard({ id: "SET1-001", collectorNumber: 1 }),
            makeCard({ id: "SET1-003", collectorNumber: 3 }), // overnumbered
            makeCard({ id: "SET1-001a", collectorNumber: 1 }), // alt art
            makeCard({ id: "SET1-001*", collectorNumber: 1 }), // signed
          ],
        },
      ],
    };

    const result = flattenWithVariants(content);
    expect(result.map((c) => c.variant)).toEqual(["Normal", "Overnumbered", "Alt Art", "Signed"]);
  });

  it("returns empty array for empty sets", () => {
    const content: RiftboundContent = {
      game: "Riftbound",
      version: "1.0",
      lastUpdated: "2025-01-01",
      sets: [],
    };
    expect(flattenWithVariants(content)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterCards
// ---------------------------------------------------------------------------

describe("filterCards", () => {
  const cards = [
    makeCard({
      id: "SET1-001",
      name: "Fire Dragon",
      type: "Unit",
      rarity: "Rare",
      faction: "Fury",
      set: "Set Alpha",
      stats: { energy: 5, might: 4, power: 6 },
      keywords: ["Shield", "Burn"],
      description: "A fiery beast",
      effect: "Deal 3 damage",
      tags: ["Dragon", "Warrior"],
      superTypes: ["Elite"],
      variant: "Normal",
      art: { thumbnailURL: "t.jpg", fullURL: "f.jpg", artist: "Alice" },
    }),
    makeCard({
      id: "SET1-002",
      name: "Ice Golem",
      type: "Unit",
      rarity: "Common",
      faction: "Calm",
      set: "Set Alpha",
      stats: { energy: 3, might: 6, power: 2 },
      keywords: ["Freeze"],
      description: "A frozen construct",
      effect: "Freeze target",
      tags: ["Golem"],
      superTypes: [],
      variant: "Normal",
      art: { thumbnailURL: "t.jpg", fullURL: "f.jpg", artist: "Bob" },
    }),
    makeCard({
      id: "SET2-001",
      name: "Mind Weaver",
      type: "Spell",
      rarity: "Epic",
      faction: "Mind/Chaos",
      set: "Set Beta",
      stats: { energy: 2, might: 0, power: 0 },
      keywords: [],
      description: "Manipulate thoughts",
      effect: "Draw 2 cards",
      tags: ["Psychic"],
      superTypes: ["Basic"],
      variant: "Alt Art",
      art: { thumbnailURL: "t.jpg", fullURL: "f.jpg", artist: "Carol" },
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

  it("search by id prefix", () => {
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

  it("filters by domain (faction)", () => {
    const result = filterCards(cards, emptyFilters({ domains: ["Fury"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fire Dragon");
  });

  it("matches split factions (multi-domain cards)", () => {
    const result = filterCards(cards, emptyFilters({ domains: ["Chaos"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("matches either domain of a split faction", () => {
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

  it("filters by powerMax", () => {
    const result = filterCards(cards, emptyFilters({ powerMax: 3 }));
    expect(result).toHaveLength(2); // Ice Golem (2), Mind Weaver (0)
  });

  // -- Variant filter --

  it("filters by variant", () => {
    const result = filterCards(cards, emptyFilters({ variants: ["Alt Art"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mind Weaver");
  });

  it("filters by multiple variants (OR)", () => {
    const result = filterCards(cards, emptyFilters({ variants: ["Normal", "Alt Art"] }));
    expect(result).toHaveLength(3);
  });

  it("excludes cards with undefined variant when variant filter is active", () => {
    const cardsWithMissingVariant = [
      makeCard({ name: "Has Variant", variant: "Normal" }),
      makeCard({ name: "No Variant", variant: undefined }),
    ];
    const result = filterCards(cardsWithMissingVariant, emptyFilters({ variants: ["Normal"] }));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Has Variant");
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
          url: null,
          normal: { low: 0.5, mid: 1, high: 2, market: 1, directLow: null },
        },
      }),
      makeCard({
        name: "Expensive Card",
        price: {
          productId: 2,
          url: null,
          normal: { low: 10, mid: 20, high: 30, market: 25, directLow: null },
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
      faction: "Mind/Chaos",
      superTypes: ["Basic"],
      stats: { energy: 2, might: 0, power: 0 },
      set: "Set Alpha",
      variant: "Alt Art",
    }),
    makeCard({
      rarity: "Common",
      type: "Unit",
      faction: "Fury",
      superTypes: ["Elite"],
      stats: { energy: 5, might: 4, power: 6 },
      set: "Set Beta",
      variant: "Normal",
    }),
    makeCard({
      rarity: "Rare",
      type: "Unit",
      faction: "Colorless",
      superTypes: [],
      stats: { energy: 3, might: 2, power: 3 },
      set: "Set Alpha",
      variant: "Normal",
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

  it("splits multi-domain factions into individual domains", () => {
    const result = getAvailableFilters(cards);
    expect(result.domains).toContain("Mind");
    expect(result.domains).toContain("Chaos");
  });

  it("sorts variants in canonical order", () => {
    const result = getAvailableFilters(cards);
    expect(result.variants).toEqual(["Normal", "Alt Art"]);
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
          url: null,
          normal: { low: 1, mid: 2, high: 3, market: 2.5, directLow: null },
        },
      }),
      makeCard({
        price: {
          productId: 2,
          url: null,
          normal: { low: 10, mid: 20, high: 30, market: 25.3, directLow: null },
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

  it("handles empty card array", () => {
    const result = getAvailableFilters([]);
    expect(result.sets).toEqual([]);
    expect(result.rarities).toEqual([]);
    expect(result.types).toEqual([]);
    expect(result.superTypes).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.variants).toEqual([]);
    expect(result.energyMin).toBe(0);
    expect(result.energyMax).toBe(0);
    expect(result.priceMin).toBe(0);
    expect(result.priceMax).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortCards
// ---------------------------------------------------------------------------

describe("sortCards", () => {
  const cards = [
    makeCard({
      id: "SET1-003",
      name: "Charlie",
      rarity: "Epic",
      stats: { energy: 5, might: 0, power: 0 },
    }),
    makeCard({
      id: "SET1-001",
      name: "Alpha",
      rarity: "Common",
      stats: { energy: 2, might: 0, power: 0 },
    }),
    makeCard({
      id: "SET1-002",
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

  it("sorts by id (string comparison)", () => {
    const result = sortCards(cards, "id");
    expect(result.map((c) => c.id)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
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
          url: null,
          normal: { low: 1, mid: 2, high: 3, market: 20, directLow: null },
        },
      }),
      makeCard({ name: "No Price" }),
      makeCard({
        name: "Cheap",
        price: {
          productId: 2,
          url: null,
          normal: { low: 1, mid: 2, high: 3, market: 1, directLow: null },
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
            url: null,
            normal: { low: 1, mid: 2, high: 3, market: 5, directLow: null },
          },
        }),
        makeCard({
          name: "Alpha",
          price: {
            productId: 2,
            url: null,
            normal: { low: 1, mid: 2, high: 3, market: 5, directLow: null },
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
