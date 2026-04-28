import { describe, expect, it } from "bun:test";

import {
  computeFilterCounts,
  filterCards,
  getAvailableFilters as getAvailableFiltersRaw,
  parseSearchTerms,
  sortCards,
} from "./filters";
import type { Card, CardFilters, EnumOrders, Printing } from "./types";
import { NONE } from "./types";

const TEST_ORDERS: EnumOrders = {
  domains: ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"],
  rarities: ["Common", "Uncommon", "Rare", "Epic", "Showcase"],
  artVariants: ["normal", "altart", "overnumbered", "ultimate"],
  cardTypes: ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield", "Other"],
  superTypes: ["Basic", "Champion", "Signature", "Token"],
  finishes: ["normal", "foil", "metal", "metal-deluxe"],
};

/**
 * Wrapper that supplies `orders` so existing tests don't need to pass it.
 * @returns The result of `getAvailableFilters` with `TEST_ORDERS` as the default.
 */
function getAvailableFilters(
  printings: Printing[],
  options: Partial<Parameters<typeof getAvailableFiltersRaw>[1]> = {},
) {
  return getAvailableFiltersRaw(printings, { orders: TEST_ORDERS, ...options });
}

// Tests inject prices via a WeakMap keyed by printing identity, since the
// production `Printing` type no longer carries prices on the object itself.
// `withPrice(makePrinting(...), 1.50)` attaches a price; `getTestPrice` reads it
// when passed as the `getPrice` option to filterCards/sortCards/getAvailableFilters.
const TEST_PRICES = new WeakMap<Printing, number>();
function withPrice(printing: Printing, price: number): Printing {
  TEST_PRICES.set(printing, price);
  return printing;
}
const getTestPrice = (p: Printing): number | undefined => TEST_PRICES.get(p);

// ---------------------------------------------------------------------------
// Helpers — build minimal Printing objects for testing
// ---------------------------------------------------------------------------

function makePrinting(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  const { card: cardOverrides, ...printingOverrides } = overrides;
  const cardSlug = cardOverrides?.slug ?? "SET1-001";
  return {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    setSlug: "Set Alpha",
    setReleased: true,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [{ face: "front", full: "thumb-full.webp", thumbnail: "thumb-400w.webp" }],
    artist: "Jane Doe",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
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
      errata: null,
      bans: [],
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
    languages: [],
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
    hasAnyMarker: null,
    markerSlugs: [],
    distributionChannelSlugs: [],
    isBanned: null,
    hasErrata: null,
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

  it("ignores a bare prefix with no value (n: alone)", () => {
    // "n:" followed by nothing — the regex captures empty match[3]
    expect(parseSearchTerms("n:")).toEqual([]);
  });

  it("parses prefix followed by whitespace as empty (ignored)", () => {
    // "n: dragon" — "n:" captures empty, "dragon" becomes bare term
    const result = parseSearchTerms("n: dragon");
    expect(result).toEqual([{ field: null, text: "dragon" }]);
  });

  it("parses mixed quoted and unquoted terms", () => {
    const result = parseSearchTerms('"fire dragon" ice');
    expect(result).toEqual([
      { field: null, text: "fire dragon" },
      { field: null, text: "ice" },
    ]);
  });

  it("parses multiple prefix types in one query", () => {
    const result = parseSearchTerms('n:dragon t:warrior d:"fiery beast" a:jane');
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: "tags", text: "warrior" },
      { field: "cardText", text: "fiery beast" },
      { field: "artist", text: "jane" },
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
      shortCode: "SET1-001",
      setSlug: "Set Alpha",
      rarity: "Rare",
      artVariant: "normal",
      finish: "normal",
      images: [{ face: "front", full: "t-full.webp", thumbnail: "t-400w.webp" }],
      artist: "Alice",
      cardId: "SET1-001",
      card: {
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
        errata: {
          correctedRulesText: "A fiery beast",
          correctedEffectText: "Deal 3 damage",
          source: "Test",
          sourceUrl: null,
          effectiveDate: null,
        },
      },
    }),
    makePrinting({
      id: "SET1-002:common:foil:",
      shortCode: "SET1-002",
      setSlug: "Set Alpha",
      rarity: "Common",
      artVariant: "normal",
      finish: "foil",
      images: [{ face: "front", full: "t-full.webp", thumbnail: "t-400w.webp" }],
      artist: "Bob",
      cardId: "SET1-002",
      card: {
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
        errata: {
          correctedRulesText: "A frozen construct",
          correctedEffectText: "Freeze target",
          source: "Test",
          sourceUrl: null,
          effectiveDate: null,
        },
      },
    }),
    makePrinting({
      id: "SET2-001:epic:normal:",
      shortCode: "SET2-001a",
      setSlug: "Set Beta",
      rarity: "Epic",
      artVariant: "altart",
      finish: "normal",
      images: [{ face: "front", full: "t-full.webp", thumbnail: "t-400w.webp" }],
      artist: "Carol",
      cardId: "SET2-001",
      card: {
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
        errata: {
          correctedRulesText: "Manipulate thoughts",
          correctedEffectText: "Draw 2 cards",
          source: "Test",
          sourceUrl: null,
          effectiveDate: null,
        },
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

  it("search by id prefix matches shortCode", () => {
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

  // -- Language filter --

  it("filters by language", () => {
    const catalog = [
      makePrinting({ id: "en-printing", language: "EN", card: { slug: "c1", name: "Alpha" } }),
      makePrinting({ id: "de-printing", language: "DE", card: { slug: "c2", name: "Beta" } }),
      makePrinting({ id: "ja-printing", language: "JA", card: { slug: "c3", name: "Gamma" } }),
    ];
    const result = filterCards(catalog, emptyFilters({ languages: ["EN"] }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("en-printing");
  });

  it("filters by multiple languages (OR)", () => {
    const catalog = [
      makePrinting({ id: "en-printing", language: "EN", card: { slug: "c1", name: "Alpha" } }),
      makePrinting({ id: "de-printing", language: "DE", card: { slug: "c2", name: "Beta" } }),
      makePrinting({ id: "ja-printing", language: "JA", card: { slug: "c3", name: "Gamma" } }),
    ];
    const result = filterCards(catalog, emptyFilters({ languages: ["EN", "DE"] }));
    expect(result).toHaveLength(2);
  });

  it("shows all printings when languages filter is empty", () => {
    const catalog = [
      makePrinting({ id: "en-printing", language: "EN", card: { slug: "c1", name: "Alpha" } }),
      makePrinting({ id: "de-printing", language: "DE", card: { slug: "c2", name: "Beta" } }),
    ];
    const result = filterCards(catalog, emptyFilters({ languages: [] }));
    expect(result).toHaveLength(2);
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
        cardId: "s",
        card: {
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
          errata: null,
        },
      }),
      makePrinting({
        isSigned: false,
        cardId: "u",
        card: {
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
          errata: null,
        },
      }),
    ];
    const result = filterCards(withSigned, emptyFilters({ isSigned: true }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Signed Card");
  });

  // -- markers filter --

  it("filters by hasAnyMarker=true", () => {
    const withPromo = [
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        cardId: "p",
        card: {
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
          errata: null,
        },
      }),
      makePrinting({
        markers: [],
        cardId: "r",
        card: {
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
          errata: null,
        },
      }),
    ];
    const result = filterCards(withPromo, emptyFilters({ hasAnyMarker: true }));
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
      withPrice(
        makePrinting({
          cardId: "c",
          card: {
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
            errata: null,
          },
        }),
        1,
      ),
      withPrice(
        makePrinting({
          cardId: "e",
          card: {
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
            errata: null,
          },
        }),
        25,
      ),
      makePrinting({
        cardId: "n",
        card: {
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
          errata: null,
        },
      }),
    ];

    const result = filterCards(withPrices, emptyFilters({ price: { min: 5, max: 30 } }), {
      getPrice: getTestPrice,
    });
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

  // -- Edge cases: null artVariant defaults to "normal" --

  it("treats null artVariant as normal when filtering", () => {
    const nullArtVariant = [
      makePrinting({
        artVariant: null as unknown as "normal",
        cardId: "nav",
        card: { name: "Null Art Card" },
      }),
    ];
    const result = filterCards(nullArtVariant, emptyFilters({ artVariants: ["normal"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Null Art Card");
  });

  // -- Edge cases: card text search with null errata --

  it("card text search handles null errata", () => {
    const nullTextCard = [
      makePrinting({
        cardId: "nt",
        card: {
          name: "No Text Card",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(nullTextCard, emptyFilters({ search: "d:something" }));
    expect(result).toHaveLength(0);
  });

  // -- Edge cases: isSigned filter set to false --

  it("filters by isSigned=false excludes signed cards", () => {
    const cards = [
      makePrinting({
        isSigned: true,
        cardId: "s1",
        card: { name: "Signed Card" },
      }),
      makePrinting({
        isSigned: false,
        cardId: "s2",
        card: { name: "Unsigned Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isSigned: false }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Unsigned Card");
  });

  // -- Edge cases: hasAnyMarker filter set to false --

  it("filters by hasAnyMarker=false excludes marked cards", () => {
    const cards = [
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        cardId: "p1",
        card: { name: "Promo Card" },
      }),
      makePrinting({
        markers: [],
        cardId: "p2",
        card: { name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ hasAnyMarker: false }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Regular Card");
  });

  // -- Edge cases: range boundary exactness --

  it("includes values exactly at range boundaries", () => {
    const result = filterCards(printings, emptyFilters({ energy: { min: 5, max: 5 } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  // -- Edge cases: stat filters with null stats --

  it("excludes cards with null energy when energy filter is active", () => {
    const cards = [
      makePrinting({
        cardId: "ne",
        card: {
          name: "No Energy Card",
          type: "Spell",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
  });

  it("excludes cards with null might when might filter is active", () => {
    const cards = [
      makePrinting({
        cardId: "nm",
        card: {
          name: "No Might Card",
          type: "Spell",
          superTypes: [],
          domains: [],
          energy: 3,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ might: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
  });

  it("excludes cards with null power when power filter is active", () => {
    const cards = [
      makePrinting({
        cardId: "np",
        card: {
          name: "No Power Card",
          type: "Spell",
          superTypes: [],
          domains: [],
          energy: 3,
          might: 2,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ power: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
  });

  // -- NONE sentinel: include / isolate null-stat cards --

  it("includes null-energy cards when min is NONE", () => {
    const cards = [
      makePrinting({
        cardId: "1",
        card: { name: "Spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "Unit", energy: 3 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: NONE, max: 5 } }));
    expect(result).toHaveLength(2);
  });

  it("isolates null-energy cards when both min and max are NONE", () => {
    const cards = [
      makePrinting({
        cardId: "1",
        card: { name: "Spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "Unit", energy: 3 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: NONE, max: NONE } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Spell");
  });

  it("excludes null-energy cards when min is a real number", () => {
    const cards = [
      makePrinting({
        cardId: "1",
        card: { name: "Spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "Unit", energy: 0 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: 0, max: 10 } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Unit");
  });

  it("includes null-might cards when min is NONE", () => {
    const cards = [
      makePrinting({ cardId: "1", card: { name: "Spell", might: null } }),
      makePrinting({ cardId: "2", card: { name: "Unit", might: 4 } }),
    ];
    const result = filterCards(cards, emptyFilters({ might: { min: NONE, max: 5 } }));
    expect(result).toHaveLength(2);
  });

  it("isolates null-power cards when both min and max are NONE", () => {
    const cards = [
      makePrinting({ cardId: "1", card: { name: "Spell", power: null } }),
      makePrinting({ cardId: "2", card: { name: "Unit", power: 6 } }),
    ];
    const result = filterCards(cards, emptyFilters({ power: { min: NONE, max: NONE } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Spell");
  });

  // -- Edge case: search with no search string returns all --

  it("returns all printings when search is empty string", () => {
    const result = filterCards(printings, emptyFilters({ search: "" }));
    expect(result).toHaveLength(3);
  });

  // -- Edge case: empty arrays for enum filters pass everything --

  it("empty sets/rarities/types arrays pass all values through", () => {
    const result = filterCards(
      printings,
      emptyFilters({
        sets: [],
        rarities: [],
        types: [],
        domains: [],
        superTypes: [],
        artVariants: [],
        finishes: [],
      }),
    );
    expect(result).toHaveLength(3);
  });

  // -- Edge case: search with effect text match only --

  it("card text search matches errata effectText only (not rulesText)", () => {
    const cards = [
      makePrinting({
        cardId: "et",
        card: {
          name: "Effect Only",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: {
            correctedRulesText: null,
            correctedEffectText: "Unique effect text here",
            source: "Test",
            sourceUrl: null,
            effectiveDate: null,
          },
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ search: "d:unique" }));
    expect(result).toHaveLength(1);
  });

  // -- Edge case: multiple search scopes without prefixes --

  it("bare search respects searchScope when no prefixes are used", () => {
    // search for "alice" with scope ["name"] — should NOT match artist
    const result = filterCards(printings, emptyFilters({ search: "alice", searchScope: ["name"] }));
    expect(result).toHaveLength(0);
  });

  it("bare search with artist in scope matches artist field", () => {
    const result = filterCards(
      printings,
      emptyFilters({ search: "alice", searchScope: ["artist"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  // -- markers / channels filter: detailed branch coverage --

  it("filters by distributionChannelSlugs (channel-only filter)", () => {
    const channelNexus = {
      id: "1",
      slug: "nexus-night",
      label: "Nexus Night",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const channelLaunch = {
      id: "2",
      slug: "launch-day",
      label: "Launch Day",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const cards = [
      makePrinting({
        markers: [{ id: "m", slug: "promo", label: "Promo", description: null }],
        distributionChannels: [
          { channel: channelNexus, distributionNote: null, ancestorLabels: [] },
        ],
        cardId: "p1",
        card: { name: "Nexus Card" },
      }),
      makePrinting({
        markers: [{ id: "m", slug: "promo", label: "Promo", description: null }],
        distributionChannels: [
          { channel: channelLaunch, distributionNote: null, ancestorLabels: [] },
        ],
        cardId: "p2",
        card: { name: "Launch Card" },
      }),
      makePrinting({
        markers: [],
        distributionChannels: [],
        cardId: "p3",
        card: { name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ distributionChannelSlugs: ["nexus-night"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Nexus Card");
  });

  it("filters by hasAnyMarker=true with specific markerSlugs", () => {
    const cards = [
      makePrinting({
        markers: [{ id: "1", slug: "top-8", label: "Top 8", description: null }],
        cardId: "p1",
        card: { name: "Top 8 Card" },
      }),
      makePrinting({
        markers: [{ id: "2", slug: "promo", label: "Promo", description: null }],
        cardId: "p2",
        card: { name: "Promo Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ hasAnyMarker: true, markerSlugs: ["top-8"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Top 8 Card");
  });

  it("filters by hasAnyMarker=true with empty markerSlugs returns all marked", () => {
    const cards = [
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        cardId: "p1",
        card: { name: "Promo Card" },
      }),
      makePrinting({
        markers: [],
        cardId: "p2",
        card: { name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ hasAnyMarker: true, markerSlugs: [] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Promo Card");
  });

  it("markerSlugs filter excludes unmarked cards", () => {
    const cards = [
      makePrinting({
        markers: [],
        cardId: "r",
        card: { name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ markerSlugs: ["promo"] }));
    expect(result).toHaveLength(0);
  });

  // -- Range edge case: value below min --

  it("excludes value below min in range filter", () => {
    const cards = [
      makePrinting({
        cardId: "low",
        card: {
          name: "Low Energy",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: 1,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: 3, max: null } }));
    expect(result).toHaveLength(0);
  });

  // -- Range edge case: value above max --

  it("excludes value above max in range filter", () => {
    const cards = [
      makePrinting({
        cardId: "high",
        card: {
          name: "High Energy",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: 10,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: null, max: 5 } }));
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
      setSlug: "Set Alpha",
      artVariant: "altart",
      finish: "normal",
      cardId: "1",
      card: {
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
        errata: null,
      },
    }),
    makePrinting({
      rarity: "Common",
      setSlug: "Set Beta",
      artVariant: "normal",
      finish: "normal",
      cardId: "2",
      card: {
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
        errata: null,
      },
    }),
    makePrinting({
      rarity: "Rare",
      setSlug: "Set Alpha",
      artVariant: "normal",
      finish: "foil",
      cardId: "3",
      card: {
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
        errata: null,
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
    const withPrices = [withPrice(makePrinting(), 2.5), withPrice(makePrinting(), 25.3)];
    const result = getAvailableFilters(withPrices, { getPrice: getTestPrice });
    expect(result.price).toEqual({ min: 2, max: 26 }); // floor(2.5), ceil(25.3)
  });

  it("returns 0 price range when no getPrice resolver is supplied", () => {
    const withPrices = [withPrice(makePrinting(), 2.5), withPrice(makePrinting(), 25.3)];
    const result = getAvailableFilters(withPrices);
    expect(result.price).toEqual({ min: 0, max: 0 });
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

  it("computes hasAnyMarker true when marked printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
      }),
      makePrinting({ markers: [] }),
    ]);
    expect(result.hasAnyMarker).toBe(true);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].slug).toBe("promo");
  });

  it("computes hasAnyMarker false when no marked printings", () => {
    const result = getAvailableFilters([makePrinting({ markers: [] })]);
    expect(result.hasAnyMarker).toBe(false);
    expect(result.markers).toHaveLength(0);
  });

  it("handles printings with null energy/might/power", () => {
    const result = getAvailableFilters([
      makePrinting({
        cardId: "null-stats",
        card: {
          name: "Null Stats",
          type: "Spell",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ]);
    expect(result.energy).toEqual({ min: 0, max: 0 });
    expect(result.might).toEqual({ min: 0, max: 0 });
    expect(result.power).toEqual({ min: 0, max: 0 });
    expect(result.hasNullEnergy).toBe(true);
    expect(result.hasNullMight).toBe(true);
    expect(result.hasNullPower).toBe(true);
  });

  it("computes hasNull flags as false when all cards have stats", () => {
    const result = getAvailableFilters([
      makePrinting({ cardId: "1", card: { energy: 3, might: 2, power: 4 } }),
    ]);
    expect(result.hasNullEnergy).toBe(false);
    expect(result.hasNullMight).toBe(false);
    expect(result.hasNullPower).toBe(false);
  });

  it("handles null artVariant by treating it as normal", () => {
    const result = getAvailableFilters([makePrinting({ artVariant: null as unknown as "normal" })]);
    expect(result.artVariants).toContain("normal");
  });

  it("deduplicates domains from multiple printings", () => {
    const result = getAvailableFilters([
      makePrinting({
        cardId: "1",
        card: {
          name: "A",
          type: "Unit",
          superTypes: [],
          domains: ["Fury", "Mind"],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
      makePrinting({
        cardId: "2",
        card: {
          name: "B",
          type: "Unit",
          superTypes: [],
          domains: ["Mind", "Chaos"],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ]);
    // Mind appears in both, but should only be listed once
    const mindCount = result.domains.filter((d) => d === "Mind").length;
    expect(mindCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sortCards
// ---------------------------------------------------------------------------

describe("sortCards", () => {
  const printings = [
    makePrinting({
      id: "SET1-003:epic:normal:",
      shortCode: "SET1-003",
      rarity: "Epic",
      cardId: "SET1-003",
      card: {
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
        errata: null,
      },
    }),
    makePrinting({
      id: "SET1-001:rare:normal:",
      shortCode: "SET1-001",
      rarity: "Common",
      cardId: "SET1-001",
      card: {
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
        errata: null,
      },
    }),
    makePrinting({
      id: "SET1-002:common:foil:",
      shortCode: "SET1-002",
      rarity: "Rare",
      cardId: "SET1-002",
      card: {
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
        errata: null,
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

  it("sorts by id (shortCode string comparison)", () => {
    const result = sortCards(printings, "id");
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
  });

  it("sorts by energy, breaking ties by shortCode", () => {
    const result = sortCards(printings, "energy");
    // Alpha(2) and Bravo(2) tied → SET1-001 < SET1-002; then Charlie(5)
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by rarity using RARITY_ORDER, breaking ties by shortCode", () => {
    const result = sortCards(printings, "rarity", { rarityOrder: TEST_ORDERS.rarities });
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("keeps shortCode tiebreaker ascending when rarity sort is desc", () => {
    const tied = [
      makePrinting({
        shortCode: "SET1-003",
        rarity: "Common",
        cardId: "c3",
        card: {
          name: "Zeta",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: 1,
          might: 0,
          power: 0,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
      makePrinting({
        shortCode: "SET1-001",
        rarity: "Common",
        cardId: "c1",
        card: {
          name: "Alpha",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: 1,
          might: 0,
          power: 0,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
      makePrinting({
        shortCode: "SET1-002",
        rarity: "Rare",
        cardId: "c2",
        card: {
          name: "Bravo",
          type: "Unit",
          superTypes: [],
          domains: [],
          energy: 1,
          might: 0,
          power: 0,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ];
    // desc reverses rarity (Rare first) but tiebreaker stays ascending
    const result = sortCards(tied, "rarity", {
      sortDir: "desc",
      rarityOrder: TEST_ORDERS.rarities,
    });
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-002", "SET1-001", "SET1-003"]);
  });

  describe("price sort", () => {
    const pricePrintings = [
      withPrice(
        makePrinting({
          cardId: "e",
          card: {
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
            errata: null,
          },
        }),
        20,
      ),
      makePrinting({
        cardId: "n",
        card: {
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
          errata: null,
        },
      }),
      withPrice(
        makePrinting({
          cardId: "c",
          card: {
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
            errata: null,
          },
        }),
        1,
      ),
    ];

    it("sorts by price ascending, nulls last", () => {
      const result = sortCards(pricePrintings, "price", { getPrice: getTestPrice });
      expect(result.map((p) => p.card.name)).toEqual(["Cheap", "Expensive", "No Price"]);
    });

    it("breaks price ties by shortCode", () => {
      const tiedPrintings = [
        withPrice(
          makePrinting({
            shortCode: "SET1-002",
            cardId: "b",
            card: {
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
              errata: null,
            },
          }),
          5,
        ),
        withPrice(
          makePrinting({
            shortCode: "SET1-001",
            cardId: "a",
            card: {
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
              errata: null,
            },
          }),
          5,
        ),
      ];
      const result = sortCards(tiedPrintings, "price", { getPrice: getTestPrice });
      expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo"]);
    });

    it("sorts all-null-price printings by shortCode", () => {
      const nullPrintings = [
        makePrinting({
          shortCode: "SET1-002",
          cardId: "z",
          card: {
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
            errata: null,
          },
        }),
        makePrinting({
          shortCode: "SET1-001",
          cardId: "a",
          card: {
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
            errata: null,
          },
        }),
      ];
      const result = sortCards(nullPrintings, "price", { getPrice: getTestPrice });
      expect(result.map((p) => p.card.name)).toEqual(["Amy", "Zed"]);
    });

    it("keeps nulls last when sorting price desc", () => {
      const priceMix = [
        makePrinting({
          shortCode: "SET1-002",
          cardId: "n",
          card: {
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
            errata: null,
          },
        }),
        withPrice(
          makePrinting({
            shortCode: "SET1-001",
            cardId: "m",
            card: {
              name: "Mid Price",
              type: "Unit",
              superTypes: [],
              domains: [],
              energy: null,
              might: null,
              power: null,
              keywords: [],
              tags: [],
              mightBonus: null,
              errata: null,
            },
          }),
          10,
        ),
        withPrice(
          makePrinting({
            shortCode: "SET1-003",
            cardId: "h",
            card: {
              name: "High Price",
              type: "Unit",
              superTypes: [],
              domains: [],
              energy: null,
              might: null,
              power: null,
              keywords: [],
              tags: [],
              mightBonus: null,
              errata: null,
            },
          }),
          50,
        ),
      ];
      const result = sortCards(priceMix, "price", { sortDir: "desc", getPrice: getTestPrice });
      expect(result.map((p) => p.card.name)).toEqual(["High Price", "Mid Price", "No Price"]);
    });

    it("keeps nulls last when sorting energy desc", () => {
      const energyMix = [
        makePrinting({
          shortCode: "SET1-002",
          cardId: "n",
          card: {
            name: "No Energy",
            type: "Spell",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
        makePrinting({
          shortCode: "SET1-001",
          cardId: "h",
          card: {
            name: "High Energy",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: 8,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
        makePrinting({
          shortCode: "SET1-003",
          cardId: "l",
          card: {
            name: "Low Energy",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: 1,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
      ];
      const result = sortCards(energyMix, "energy", { sortDir: "desc" });
      expect(result.map((p) => p.card.name)).toEqual(["High Energy", "Low Energy", "No Energy"]);
    });

    it("uses custom getPrice for price sort", () => {
      const printingsWithCustomPrice = [
        makePrinting({
          shortCode: "SET1-001",
          cardId: "a",
          card: {
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
            errata: null,
          },
        }),
        makePrinting({
          shortCode: "SET1-002",
          cardId: "b",
          card: {
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
            errata: null,
          },
        }),
      ];
      // Override so Alpha appears more expensive
      const result = sortCards(printingsWithCustomPrice, "price", {
        sortDir: "desc",
        getPrice: (p) => (p.cardId === "a" ? 100 : 1),
      });
      expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo"]);
    });
  });

  describe("energy sort with null values", () => {
    it("pushes null energy to the end", () => {
      const energyPrintings = [
        makePrinting({
          cardId: "n",
          card: {
            name: "No Energy",
            type: "Spell",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
        makePrinting({
          cardId: "l",
          card: {
            name: "Low Energy",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: 1,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
      ];
      const result = sortCards(energyPrintings, "energy");
      expect(result.map((p) => p.card.name)).toEqual(["Low Energy", "No Energy"]);
    });

    it("sorts non-null energy before null, null by shortCode", () => {
      const energyPrintings = [
        makePrinting({
          shortCode: "SET1-002",
          cardId: "z",
          card: {
            name: "Zeta Null",
            type: "Spell",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
        makePrinting({
          shortCode: "SET1-001",
          cardId: "a",
          card: {
            name: "Alpha Null",
            type: "Spell",
            superTypes: [],
            domains: [],
            energy: null,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
        makePrinting({
          cardId: "h",
          card: {
            name: "High Energy",
            type: "Unit",
            superTypes: [],
            domains: [],
            energy: 8,
            might: null,
            power: null,
            keywords: [],
            tags: [],
            mightBonus: null,
            errata: null,
          },
        }),
      ];
      const result = sortCards(energyPrintings, "energy");
      expect(result.map((p) => p.card.name)).toEqual(["High Energy", "Alpha Null", "Zeta Null"]);
    });
  });

  it("returns empty array when given empty input", () => {
    expect(sortCards([], "name")).toEqual([]);
    expect(sortCards([], "id")).toEqual([]);
    expect(sortCards([], "energy")).toEqual([]);
    expect(sortCards([], "rarity", { rarityOrder: TEST_ORDERS.rarities })).toEqual([]);
    expect(sortCards([], "price")).toEqual([]);
  });

  it("handles single-element array for all sort modes", () => {
    const single = [makePrinting({ cardId: "x", card: { name: "Solo" } })];
    expect(sortCards(single, "name")).toHaveLength(1);
    expect(sortCards(single, "id")).toHaveLength(1);
    expect(sortCards(single, "energy")).toHaveLength(1);
    expect(sortCards(single, "rarity", { rarityOrder: TEST_ORDERS.rarities })).toHaveLength(1);
    expect(sortCards(single, "price")).toHaveLength(1);
  });

  it("throws when sortBy is 'rarity' but no rarityOrder is supplied", () => {
    expect(() => sortCards([makePrinting()], "rarity")).toThrow(/rarityOrder/);
  });
});

// ---------------------------------------------------------------------------
// computeFilterCounts
// ---------------------------------------------------------------------------

describe("computeFilterCounts", () => {
  const sample = [
    makePrinting({
      id: "p1",
      cardId: "c1",
      language: "EN",
      rarity: "Common",
      card: { slug: "c1", domains: ["Fury"] },
    }),
    makePrinting({
      id: "p2",
      cardId: "c1",
      language: "DE",
      rarity: "Common",
      card: { slug: "c1", domains: ["Fury"] },
    }),
    makePrinting({
      id: "p3",
      cardId: "c2",
      language: "EN",
      rarity: "Rare",
      card: { slug: "c2", domains: ["Calm"] },
    }),
    makePrinting({
      id: "p4",
      cardId: "c3",
      language: "JA",
      rarity: "Rare",
      card: { slug: "c3", domains: ["Mind", "Body"] },
    }),
  ];

  it("counts printings per option when no filters are active", () => {
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "printing" });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
    expect(counts.languages.get("JA")).toBe(1);
    expect(counts.rarities.get("Common")).toBe(2);
    expect(counts.rarities.get("Rare")).toBe(2);
    expect(counts.domains.get("Fury")).toBe(2);
    expect(counts.domains.get("Mind")).toBe(1);
  });

  it("excludes the dim's own filter so multi-select still widens", () => {
    // With language=EN selected, the language counts must still show DE/JA's
    // potential matches — otherwise the user couldn't multi-select.
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
    expect(counts.languages.get("JA")).toBe(1);
  });

  it("narrows other dims based on the active filter", () => {
    // With language=EN, rarity counts reflect only EN printings: c1 (Common) + c2 (Rare).
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.rarities.get("Common")).toBe(1);
    expect(counts.rarities.get("Rare")).toBe(1);
  });

  it("returns 0 (missing) for options with no matches under current filters", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["DE"] }), {
      countBy: "printing",
    });
    // Only c1's DE printing matches; rarity Rare and domains Calm/Mind/Body have 0 matches.
    expect(counts.rarities.get("Common")).toBe(1);
    expect(counts.rarities.get("Rare") ?? 0).toBe(0);
    expect(counts.domains.get("Fury")).toBe(1);
    expect(counts.domains.get("Calm") ?? 0).toBe(0);
  });

  it("counts unique cards (not printings) when countBy='card'", () => {
    // EN+DE printings of c1 should count once toward c1's domain "Fury".
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("Fury")).toBe(1);
    expect(counts.rarities.get("Common")).toBe(1);
    expect(counts.rarities.get("Rare")).toBe(2);
  });

  it("counts each domain of a multi-domain card", () => {
    // c3 has domains ["Mind", "Body"] — both should be counted.
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("Mind")).toBe(1);
    expect(counts.domains.get("Body")).toBe(1);
  });

  describe("flags", () => {
    const flagSample = [
      makePrinting({
        id: "p-signed",
        cardId: "c-signed",
        isSigned: true,
        card: { slug: "c-signed", bans: [], errata: null },
      }),
      makePrinting({
        id: "p-plain",
        cardId: "c-plain",
        isSigned: false,
        card: {
          slug: "c-plain",
          bans: [{ format: "standard", reason: "test" } as Card["bans"][number]],
          errata: { correctedRulesText: "x" } as Card["errata"],
        },
      }),
      makePrinting({
        id: "p-promo",
        cardId: "c-promo",
        isSigned: false,
        markers: [
          { slug: "promo-stamp", label: "Promo", abbreviation: "P", iconUrl: null, sortOrder: 0 },
        ],
        card: { slug: "c-promo", bans: [], errata: null },
      }),
    ];

    it("counts flags at their primary-on state when the chip is null/true", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters(), { countBy: "printing" });
      expect(counts.flags.signed).toBe(1); // only p-signed has isSigned=true
      expect(counts.flags.promo).toBe(1); // only p-promo has any marker
      expect(counts.flags.banned).toBe(1); // only c-plain has bans
      expect(counts.flags.errata).toBe(1); // only c-plain has errata
    });

    it("counts flags at their false state when the chip is in 'Not X' mode", () => {
      // With isSigned=false selected, the chip displays "Not Signed" — the
      // count should reflect the number of *unsigned* printings.
      const counts = computeFilterCounts(flagSample, emptyFilters({ isSigned: false }), {
        countBy: "printing",
      });
      expect(counts.flags.signed).toBe(2); // p-plain + p-promo are unsigned
    });

    it("flag counts respect other active filters", () => {
      // With domains=[Fury] active (default for makePrinting), all three sample
      // cards still match domain — none are filtered out — so counts are stable.
      // Use a non-matching domain to verify narrowing.
      const counts = computeFilterCounts(flagSample, emptyFilters({ domains: ["Calm"] }), {
        countBy: "printing",
      });
      expect(counts.flags.signed).toBe(0);
      expect(counts.flags.promo).toBe(0);
      expect(counts.flags.banned).toBe(0);
      expect(counts.flags.errata).toBe(0);
    });

    it("leaves flags.owned unset (computed in useCardData with collection state)", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters(), { countBy: "printing" });
      expect(counts.flags.owned).toBeUndefined();
    });
  });
});
