import { describe, expect, it } from "vitest";

import {
  computeFilterCounts,
  filterCards,
  getAvailableFilters as getAvailableFiltersRaw,
  parseSearchTerms,
  searchPrefixFields,
  sortCards,
} from "./filters";
import { ALL_SEARCH_FIELDS, EMPTY_CARD_FILTERS, NONE } from "./types";
import type { Card, CardFilters, EnumOrders, Printing } from "./types";

const TEST_ORDERS: EnumOrders = {
  domains: ["fury", "calm", "mind", "body", "chaos", "order", "colorless"],
  rarities: ["common", "uncommon", "rare", "epic", "showcase"],
  artVariants: ["normal", "altart", "overnumbered", "ultimate"],
  cardTypes: ["legend", "unit", "rune", "spell", "gear", "battlefield", "other"],
  superTypes: ["basic", "champion", "signature", "token"],
  finishes: ["normal", "foil", "metal", "metal-deluxe"],
  cardSizes: ["standard", "oversized"],
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
  const cardType = cardOverrides?.type ?? cardOverrides?.types?.[0] ?? "unit";
  return {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    setSlug: "Set Alpha",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae01dab" }],
    artist: "Jane Doe",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: cardSlug,
      name: "Test Card",
      type: cardType,
      types: [cardType],
      superTypes: [],
      domains: ["fury"],
      tokenCardIds: [],
      energy: 3,
      might: 2,
      power: 4,
      keywords: ["Shield"],
      tags: ["Warrior"],
      mightBonus: 0,
      maxCopiesOverride: null,
      errata: null,
      bans: [],
      ...cardOverrides,
    },
    ...printingOverrides,
  };
}

function emptyFilters(overrides: Partial<CardFilters> = {}): CardFilters {
  return {
    ...EMPTY_CARD_FILTERS,
    // Narrow the default search scope to name-only so search tests stay focused;
    // every other dimension comes from EMPTY_CARD_FILTERS.
    searchScope: ["name"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseSearchTerms
// ---------------------------------------------------------------------------

/**
 * `parseSearchTerms` reduced to the two fields these tests assert on. The parser
 * also attaches the folded and squashed forms of each term; those are covered in
 * `search-fold.test.ts` and would only add noise to every expectation here.
 * @returns The parsed terms as `{ field, text }` pairs.
 */
function terms(raw: string): { field: string | null; text: string }[] {
  return parseSearchTerms(raw).map(({ field, text }) => ({ field, text }));
}

describe("parseSearchTerms", () => {
  it("returns empty array for empty string", () => {
    expect(terms("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(terms("   ")).toEqual([]);
  });

  it("parses a bare word as a null-field term", () => {
    expect(terms("dragon")).toEqual([{ field: null, text: "dragon" }]);
  });

  it("parses multiple bare words as separate terms", () => {
    const result = terms("fire dragon");
    expect(result).toEqual([
      { field: null, text: "fire" },
      { field: null, text: "dragon" },
    ]);
  });

  it("parses a quoted phrase as a single null-field term", () => {
    expect(terms('"fire dragon"')).toEqual([{ field: null, text: "fire dragon" }]);
  });

  it("parses name prefix (n:)", () => {
    expect(terms("n:dragon")).toEqual([{ field: "name", text: "dragon" }]);
  });

  it("parses card text prefix (d:)", () => {
    expect(terms("d:damage")).toEqual([{ field: "cardText", text: "damage" }]);
  });

  it("parses keywords prefix (k:)", () => {
    expect(terms("k:shield")).toEqual([{ field: "keywords", text: "shield" }]);
  });

  it("parses tags prefix (t:)", () => {
    expect(terms("t:warrior")).toEqual([{ field: "tags", text: "warrior" }]);
  });

  it("parses artist prefix (a:)", () => {
    expect(terms("a:jane")).toEqual([{ field: "artist", text: "jane" }]);
  });

  it("parses id prefix (id:)", () => {
    expect(terms("id:SET1-001")).toEqual([{ field: "id", text: "SET1-001" }]);
  });

  it("parses prefix with quoted value", () => {
    expect(terms('n:"fire dragon"')).toEqual([{ field: "name", text: "fire dragon" }]);
  });

  it("parses mixed prefixed and bare terms", () => {
    const result = terms("n:dragon fury");
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: null, text: "fury" },
    ]);
  });

  it("ignores empty prefix values", () => {
    // n: with nothing after it — the regex will try to match but get empty
    expect(terms('n:""')).toEqual([]);
  });

  it("handles multiple prefixed terms", () => {
    const result = terms("n:dragon k:shield");
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: "keywords", text: "shield" },
    ]);
  });

  it("ignores a bare prefix with no value (n: alone)", () => {
    // "n:" followed by nothing — the regex captures empty match[3]
    expect(terms("n:")).toEqual([]);
  });

  it("parses prefix followed by whitespace as empty (ignored)", () => {
    // "n: dragon" — "n:" captures empty, "dragon" becomes bare term
    const result = terms("n: dragon");
    expect(result).toEqual([{ field: null, text: "dragon" }]);
  });

  it("parses mixed quoted and unquoted terms", () => {
    const result = terms('"fire dragon" ice');
    expect(result).toEqual([
      { field: null, text: "fire dragon" },
      { field: null, text: "ice" },
    ]);
  });

  it("parses multiple prefix types in one query", () => {
    const result = terms('n:dragon t:warrior d:"fiery beast" a:jane');
    expect(result).toEqual([
      { field: "name", text: "dragon" },
      { field: "tags", text: "warrior" },
      { field: "cardText", text: "fiery beast" },
      { field: "artist", text: "jane" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// searchPrefixFields
// ---------------------------------------------------------------------------

describe("searchPrefixFields", () => {
  it("reports no fields for a query without prefixes", () => {
    expect(searchPrefixFields("fire dragon")).toEqual([]);
  });

  it("reports the field of a prefix that has no term yet", () => {
    // The point of the helper: "n:" is not a term (parseSearchTerms drops it)
    // but the search bar must already show the chip.
    expect(searchPrefixFields("n:")).toEqual(["name"]);
    expect(parseSearchTerms("n:")).toEqual([]);
  });

  it("reports the field of a two-letter prefix", () => {
    expect(searchPrefixFields("ty:unit")).toEqual(["type"]);
    expect(searchPrefixFields("id:ogn-269")).toEqual(["id"]);
  });

  it("collects every prefix in canonical order, ignoring loose terms", () => {
    expect(searchPrefixFields("k:fury n:teemo fire")).toEqual(["name", "keywords"]);
  });

  it("deduplicates a prefix used twice", () => {
    expect(searchPrefixFields("n:teemo n:tristana")).toEqual(["name"]);
  });

  it("reads the prefix of a quoted term", () => {
    expect(searchPrefixFields('d:"deal damage"')).toEqual(["cardText"]);
  });

  it("ignores a colon inside a word", () => {
    expect(searchPrefixFields("ogn:269")).toEqual([]);
    expect(searchPrefixFields("https://example.test")).toEqual([]);
  });

  it("ignores an unknown prefix letter", () => {
    expect(searchPrefixFields("z:teemo")).toEqual([]);
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
      rarity: "rare",
      artVariant: "normal",
      finish: "normal",
      images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae01dab" }],
      artist: "Alice",
      cardId: "SET1-001",
      card: {
        name: "Fire Dragon",
        type: "unit",
        superTypes: ["champion"],
        domains: ["fury"],
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
      rarity: "common",
      artVariant: "normal",
      finish: "foil",
      images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae01dab" }],
      artist: "Bob",
      cardId: "SET1-002",
      card: {
        name: "Ice Golem",
        type: "unit",
        superTypes: [],
        domains: ["calm"],
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
      rarity: "epic",
      artVariant: "altart",
      finish: "normal",
      images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae01dab" }],
      artist: "Carol",
      cardId: "SET2-001",
      card: {
        name: "Mind Weaver",
        type: "spell",
        superTypes: ["basic"],
        domains: ["mind", "chaos"],
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
    const result = filterCards(printings, emptyFilters({ rarities: ["common"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Ice Golem");
  });

  it("filters by multiple rarities (OR)", () => {
    const result = filterCards(printings, emptyFilters({ rarities: ["rare", "epic"] }));
    expect(result).toHaveLength(2);
  });

  // -- Type filter --

  it("filters by card type", () => {
    const result = filterCards(printings, emptyFilters({ types: ["spell"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("matches multi-type cards under every type they carry (ADR-037)", () => {
    const unitGear = makePrinting({
      id: "p-dual",
      cardId: "c-dual",
      card: { name: "Hexcore Carrier", type: "unit", types: ["unit", "gear"] },
    });
    const all = [...printings, unitGear];
    const byUnit = filterCards(all, emptyFilters({ types: ["unit"] }));
    const byGear = filterCards(all, emptyFilters({ types: ["gear"] }));
    expect(byUnit.map((p) => p.id)).toContain("p-dual");
    expect(byGear.map((p) => p.id)).toContain("p-dual");
    const excluded = filterCards(all, emptyFilters({ typesExclude: ["gear"] }));
    expect(excluded.map((p) => p.id)).not.toContain("p-dual");
  });

  // -- SuperType filter --

  it("filters by superType", () => {
    const result = filterCards(printings, emptyFilters({ superTypes: ["champion"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("printings with no matching superType are excluded", () => {
    const result = filterCards(printings, emptyFilters({ superTypes: ["champion"] }));
    expect(result.find((p) => p.card.name === "Ice Golem")).toBeUndefined();
  });

  // -- Domain filter --

  it("filters by domain", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["fury"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Fire Dragon");
  });

  it("matches multi-domain printings", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["chaos"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Mind Weaver");
  });

  it("matches either domain of a multi-domain card", () => {
    const result = filterCards(printings, emptyFilters({ domains: ["mind"] }));
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

  // -- Card size filter --

  it("filters by card size", () => {
    const standard = makePrinting({ id: "std", size: "standard" });
    const oversized = makePrinting({ id: "ovr", size: "oversized" });
    const result = filterCards([standard, oversized], emptyFilters({ cardSizes: ["oversized"] }));
    expect(result.map((p) => p.id)).toEqual(["ovr"]);
  });

  // -- isSigned filter --

  it("filters by isSigned", () => {
    const withSigned = [
      makePrinting({
        isSigned: true,
        cardId: "s",
        card: {
          name: "Signed Card",
          type: "unit",
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
          type: "unit",
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

  it("filters by presence.markers=any", () => {
    const withPromo = [
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        cardId: "p",
        card: {
          name: "Promo Card",
          type: "unit",
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
          type: "unit",
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
    const result = filterCards(withPromo, emptyFilters({ presence: { markers: "any" } }));
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
            type: "unit",
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
            type: "unit",
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
          type: "unit",
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
        rarities: ["common"],
        types: ["unit"],
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
        rarities: ["common"],
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
          type: "unit",
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

  // -- Edge cases: presence.markers set to "none" --

  it("filters by presence.markers=none excludes marked cards", () => {
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
    const result = filterCards(cards, emptyFilters({ presence: { markers: "none" } }));
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
          type: "spell",
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
          type: "spell",
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
          type: "spell",
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
        card: { name: "spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "unit", energy: 3 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: NONE, max: 5 } }));
    expect(result).toHaveLength(2);
  });

  it("isolates null-energy cards when both min and max are NONE", () => {
    const cards = [
      makePrinting({
        cardId: "1",
        card: { name: "spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "unit", energy: 3 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: NONE, max: NONE } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("spell");
  });

  it("excludes null-energy cards when min is a real number", () => {
    const cards = [
      makePrinting({
        cardId: "1",
        card: { name: "spell", energy: null, might: null, power: null },
      }),
      makePrinting({ cardId: "2", card: { name: "unit", energy: 0 } }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: 0, max: 10 } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("unit");
  });

  it("includes null-might cards when min is NONE", () => {
    const cards = [
      makePrinting({ cardId: "1", card: { name: "spell", might: null } }),
      makePrinting({ cardId: "2", card: { name: "unit", might: 4 } }),
    ];
    const result = filterCards(cards, emptyFilters({ might: { min: NONE, max: 5 } }));
    expect(result).toHaveLength(2);
  });

  it("isolates null-power cards when both min and max are NONE", () => {
    const cards = [
      makePrinting({ cardId: "1", card: { name: "spell", power: null } }),
      makePrinting({ cardId: "2", card: { name: "unit", power: 6 } }),
    ];
    const result = filterCards(cards, emptyFilters({ power: { min: NONE, max: NONE } }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("spell");
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
          type: "unit",
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

  it("filters by presence.markers=any with specific markerSlugs", () => {
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
    const result = filterCards(
      cards,
      emptyFilters({ presence: { markers: "any" }, markerSlugs: ["top-8"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Top 8 Card");
  });

  it("filters by presence.markers=any with empty markerSlugs returns all marked", () => {
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
    const result = filterCards(
      cards,
      emptyFilters({ presence: { markers: "any" }, markerSlugs: [] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Promo Card");
  });

  // -- Generic presence predicate: any / none per dimension --

  describe("presence predicate", () => {
    const channel = {
      id: "ch1",
      slug: "nexus-night",
      label: "Nexus Night",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };

    // For each dimension: a printing that HAS a value and one that has NONE.
    const withMarker = makePrinting({
      cardId: "has-marker",
      markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
    });
    const withoutMarker = makePrinting({ cardId: "no-marker", markers: [] });
    const withSuperType = makePrinting({ cardId: "has-super", card: { superTypes: ["champion"] } });
    // "basic" is the placeholder supertype — it must count as "no supertype".
    const onlyBasic = makePrinting({ cardId: "basic-only", card: { superTypes: ["basic"] } });
    const withChannel = makePrinting({
      cardId: "has-channel",
      distributionChannels: [{ channel, distributionNote: null, ancestorLabels: [] }],
    });
    const withoutChannel = makePrinting({ cardId: "no-channel", distributionChannels: [] });
    const withKeyword = makePrinting({ cardId: "has-kw", card: { keywords: ["Shield"] } });
    const withoutKeyword = makePrinting({ cardId: "no-kw", card: { keywords: [] } });

    it("markers: any keeps marked, none keeps unmarked", () => {
      const cards = [withMarker, withoutMarker];
      expect(
        filterCards(cards, emptyFilters({ presence: { markers: "any" } })).map((p) => p.cardId),
      ).toEqual(["has-marker"]);
      expect(
        filterCards(cards, emptyFilters({ presence: { markers: "none" } })).map((p) => p.cardId),
      ).toEqual(["no-marker"]);
    });

    it("superTypes: 'basic' placeholder counts as no supertype", () => {
      const cards = [withSuperType, onlyBasic];
      expect(
        filterCards(cards, emptyFilters({ presence: { superTypes: "any" } })).map((p) => p.cardId),
      ).toEqual(["has-super"]);
      expect(
        filterCards(cards, emptyFilters({ presence: { superTypes: "none" } })).map((p) => p.cardId),
      ).toEqual(["basic-only"]);
    });

    it("distributionChannels: any keeps distributed, none keeps undistributed", () => {
      const cards = [withChannel, withoutChannel];
      expect(
        filterCards(cards, emptyFilters({ presence: { distributionChannels: "any" } })).map(
          (p) => p.cardId,
        ),
      ).toEqual(["has-channel"]);
      expect(
        filterCards(cards, emptyFilters({ presence: { distributionChannels: "none" } })).map(
          (p) => p.cardId,
        ),
      ).toEqual(["no-channel"]);
    });

    it("keywords: any keeps keyworded, none keeps keyword-less", () => {
      const cards = [withKeyword, withoutKeyword];
      expect(
        filterCards(cards, emptyFilters({ presence: { keywords: "any" } })).map((p) => p.cardId),
      ).toEqual(["has-kw"]);
      expect(
        filterCards(cards, emptyFilters({ presence: { keywords: "none" } })).map((p) => p.cardId),
      ).toEqual(["no-kw"]);
    });

    it("customTags: any/none use the customTagAssignments lookup", () => {
      const tagged = makePrinting({ cardId: "tagged" });
      const untagged = makePrinting({ cardId: "untagged" });
      const cards = [tagged, untagged];
      const options = { customTagAssignments: { tagged: ["foil-hunt"] } };
      expect(
        filterCards(cards, emptyFilters({ presence: { customTags: "any" } }), options).map(
          (p) => p.cardId,
        ),
      ).toEqual(["tagged"]);
      expect(
        filterCards(cards, emptyFilters({ presence: { customTags: "none" } }), options).map(
          (p) => p.cardId,
        ),
      ).toEqual(["untagged"]);
    });

    it("constraints across dimensions combine (AND)", () => {
      const both = makePrinting({
        cardId: "both",
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        card: { keywords: [] },
      });
      const cards = [both, withMarker, withoutKeyword];
      // markers=any AND keywords=none: only "both" qualifies (withMarker has a keyword).
      expect(
        filterCards(cards, emptyFilters({ presence: { markers: "any", keywords: "none" } })).map(
          (p) => p.cardId,
        ),
      ).toEqual(["both"]);
    });

    it("empty presence map imposes no constraint", () => {
      const cards = [withMarker, withoutMarker];
      expect(filterCards(cards, emptyFilters({ presence: {} }))).toHaveLength(2);
    });

    it("matches the old hasAnyMarker semantics (migration equivalence)", () => {
      const cards = [withMarker, withoutMarker];
      // Old hasAnyMarker=true ⇔ presence.markers=any; false ⇔ none; null ⇔ absent.
      expect(filterCards(cards, emptyFilters({ presence: { markers: "any" } }))).toEqual(
        cards.filter((p) => p.markers.length > 0),
      );
      expect(filterCards(cards, emptyFilters({ presence: { markers: "none" } }))).toEqual(
        cards.filter((p) => p.markers.length === 0),
      );
      expect(filterCards(cards, emptyFilters())).toEqual(cards);
    });
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

  // -- keywords filter --

  describe("keywords filter", () => {
    const shieldCard = makePrinting({ cardId: "shield", card: { keywords: ["Shield", "Tank"] } });
    const ambushCard = makePrinting({ cardId: "ambush", card: { keywords: ["Ambush"] } });
    const plainCard = makePrinting({ cardId: "plain", card: { keywords: [] } });
    const cards = [shieldCard, ambushCard, plainCard];

    it("passes everything when no keyword is selected", () => {
      expect(filterCards(cards, emptyFilters({ keywords: [] }))).toHaveLength(3);
    });

    it("keeps cards carrying any of the selected keywords", () => {
      expect(
        filterCards(cards, emptyFilters({ keywords: ["Shield"] })).map((p) => p.cardId),
      ).toEqual(["shield"]);
      expect(
        filterCards(cards, emptyFilters({ keywords: ["Shield", "Ambush"] })).map((p) => p.cardId),
      ).toEqual(["shield", "ambush"]);
    });

    it("excludes cards carrying an excluded keyword", () => {
      expect(
        filterCards(cards, emptyFilters({ keywordsExclude: ["Shield"] })).map((p) => p.cardId),
      ).toEqual(["ambush", "plain"]);
    });

    it("lists distinct keywords in getAvailableFilters, sorted", () => {
      expect(getAvailableFilters(cards).keywords).toEqual(["Ambush", "Shield", "Tank"]);
    });

    it("faceted counts reflect keyword usage", () => {
      const counts = computeFilterCounts(cards, emptyFilters(), { countBy: "card" });
      expect(counts.keywords.get("Shield")).toBe(1);
      expect(counts.keywords.get("Tank")).toBe(1);
      expect(counts.keywords.get("Ambush")).toBe(1);
    });
  });

  describe("tags filter", () => {
    const ioniaCard = makePrinting({ cardId: "ionia", card: { tags: ["Ionia", "Poro"] } });
    const noxusCard = makePrinting({ cardId: "noxus", card: { tags: ["Noxus"] } });
    const untaggedCard = makePrinting({ cardId: "untagged", card: { tags: [] } });
    const cards = [ioniaCard, noxusCard, untaggedCard];

    it("passes everything when no tag is selected", () => {
      expect(filterCards(cards, emptyFilters({ tags: [] }))).toHaveLength(3);
    });

    it("keeps cards carrying any of the selected tags", () => {
      expect(filterCards(cards, emptyFilters({ tags: ["Ionia"] })).map((p) => p.cardId)).toEqual([
        "ionia",
      ]);
      expect(
        filterCards(cards, emptyFilters({ tags: ["Poro", "Noxus"] })).map((p) => p.cardId),
      ).toEqual(["ionia", "noxus"]);
    });

    it("matches multi-word tags as exact values", () => {
      const targon = makePrinting({ cardId: "targon", card: { tags: ["Mount Targon"] } });
      expect(
        filterCards([targon, noxusCard], emptyFilters({ tags: ["Mount Targon"] })).map(
          (p) => p.cardId,
        ),
      ).toEqual(["targon"]);
    });

    it("excludes cards carrying an excluded tag", () => {
      expect(
        filterCards(cards, emptyFilters({ tagsExclude: ["Poro"] })).map((p) => p.cardId),
      ).toEqual(["noxus", "untagged"]);
    });

    it("combines include and exclude", () => {
      expect(
        filterCards(cards, emptyFilters({ tags: ["Ionia", "Noxus"], tagsExclude: ["Poro"] })).map(
          (p) => p.cardId,
        ),
      ).toEqual(["noxus"]);
    });

    it("lists distinct tags in getAvailableFilters, sorted", () => {
      expect(getAvailableFilters(cards).tags).toEqual(["Ionia", "Noxus", "Poro"]);
    });

    it("faceted counts reflect tag usage", () => {
      const counts = computeFilterCounts(cards, emptyFilters(), { countBy: "card" });
      expect(counts.tags.get("Ionia")).toBe(1);
      expect(counts.tags.get("Poro")).toBe(1);
      expect(counts.tags.get("Noxus")).toBe(1);
    });

    it("tag counts widen: selecting a tag keeps sibling counts", () => {
      const counts = computeFilterCounts(cards, emptyFilters({ tags: ["Ionia"] }), {
        countBy: "card",
      });
      expect(counts.tags.get("Noxus")).toBe(1);
    });

    it("presence any/none partitions by printed tags", () => {
      const anyMatched = filterCards(cards, emptyFilters({ presence: { tags: "any" } }));
      expect(anyMatched.map((p) => p.cardId)).toEqual(["ionia", "noxus"]);
      const noneMatched = filterCards(cards, emptyFilters({ presence: { tags: "none" } }));
      expect(noneMatched.map((p) => p.cardId)).toEqual(["untagged"]);
    });

    it("presence counts clear the tags value selection", () => {
      const counts = computeFilterCounts(cards, emptyFilters({ tags: ["Ionia"] }), {
        countBy: "card",
      });
      expect(counts.presence.tags).toEqual({ any: 2, none: 1 });
    });
  });

  // -- customTagSlugs filter --

  it("customTagSlugs filter passes all when empty", () => {
    const cards = [
      makePrinting({ cardId: "a", card: { name: "A" } }),
      makePrinting({ cardId: "b", card: { name: "B" } }),
    ];
    const result = filterCards(cards, emptyFilters({ customTagSlugs: [] }), {
      customTagAssignments: { a: ["bandle-city"], b: ["bilgewater"] },
    });
    expect(result).toHaveLength(2);
  });

  it("customTagSlugs filter OR-matches across selected slugs", () => {
    const cards = [
      makePrinting({ cardId: "a", card: { name: "A" } }),
      makePrinting({ cardId: "b", card: { name: "B" } }),
      makePrinting({ cardId: "c", card: { name: "C" } }),
    ];
    const result = filterCards(
      cards,
      emptyFilters({ customTagSlugs: ["bandle-city", "bilgewater"] }),
      { customTagAssignments: { a: ["bandle-city"], b: ["bilgewater"], c: ["demacia"] } },
    );
    expect(result.map((p) => p.card.name).toSorted()).toEqual(["A", "B"]);
  });

  it("customTagSlugs filter excludes cards with no assignment", () => {
    const cards = [
      makePrinting({ cardId: "a", card: { name: "A" } }),
      makePrinting({ cardId: "b", card: { name: "B" } }),
    ];
    const result = filterCards(cards, emptyFilters({ customTagSlugs: ["bandle-city"] }), {
      customTagAssignments: { a: ["bandle-city"] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("A");
  });

  it("customTagSlugs filter with missing assignment map excludes everything", () => {
    const cards = [makePrinting({ cardId: "a", card: { name: "A" } })];
    const result = filterCards(cards, emptyFilters({ customTagSlugs: ["bandle-city"] }));
    expect(result).toHaveLength(0);
  });

  // -- Range edge case: value below min --

  it("excludes value below min in range filter", () => {
    const cards = [
      makePrinting({
        cardId: "low",
        card: {
          name: "Low Energy",
          type: "unit",
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
          type: "unit",
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
// filterCards — punctuation-tolerant search
// ---------------------------------------------------------------------------

describe("filterCards search folding", () => {
  // Real catalogue values: fixTypography stores U+2019 apostrophes, U+2212 for
  // the minus in "-1", and keywords are hyphenated.
  const printings = [
    makePrinting({
      id: "OGN-101",
      shortCode: "OGN-101",
      artist: "黯荧岛Dark Glow",
      printedRulesText: "Give a unit −1 :rb_might:. [Equip] a Gear.",
      flavorText: "Sweet revenge—it’s épéeback.",
      card: {
        slug: "dorans-shield",
        name: "Doran’s Shield",
        keywords: ["Quick-Draw"],
        tags: ["Kha’Zix"],
      },
    }),
    makePrinting({
      id: "OGN-269",
      shortCode: "OGN-269",
      artist: "Jane Doe",
      printedName: "波比，扶弱使者",
      printedRulesText: "Deal 1 damage. Draw a card.",
      card: {
        slug: "kaisa-survivor",
        name: "Kai’Sa, Survivor",
        keywords: ["Shield"],
        tags: ["Sentinel"],
      },
    }),
    // Mentions "Equip" as prose rather than as the bracketed keyword, so the
    // bracket-precision test below has something it must NOT match.
    makePrinting({
      id: "OGN-400",
      shortCode: "OGN-400",
      artist: "Jane Doe",
      printedRulesText: "Equip a Gear to deal 1 damage.",
      card: { slug: "sterak-gage", name: "Sterak’s Gage", keywords: [], tags: [] },
    }),
  ];

  const names = (filters: Partial<CardFilters>) =>
    filterCards(printings, emptyFilters({ searchScope: [...ALL_SEARCH_FIELDS], ...filters })).map(
      (p) => p.card.name,
    );

  describe("names", () => {
    it.each([
      ["curly apostrophe, as stored", "Doran’s Shield"],
      ["straight apostrophe, as typed", "Doran's Shield"],
      ["apostrophe omitted", "dorans shield"],
      ["single word, apostrophe omitted", "dorans"],
      ["no spaces at all", "doransshield"],
    ])("finds Doran’s Shield by %s", (_label, search) => {
      expect(names({ search })).toEqual(["Doran’s Shield"]);
    });

    it.each([["kaisa"], ["kai'sa"], ["Kai'Sa, Survivor"], ["kaisa survivor"], ["kaisasurvivor"]])(
      "finds Kai’Sa, Survivor by %s",
      (search) => {
        expect(names({ search })).toEqual(["Kai’Sa, Survivor"]);
      },
    );

    it("matches a localized printed name typed with an ASCII comma", () => {
      // Stored with the fullwidth comma U+FF0C, which NFKD folds to ",".
      expect(names({ search: "n:波比,扶弱使者" })).toEqual(["Kai’Sa, Survivor"]);
    });
  });

  describe("card text", () => {
    it("finds a minus-sign value typed as an ASCII hyphen", () => {
      // Stored as U+2212. Typing "-1" returned nothing before folding.
      expect(names({ search: "d:-1 might" })).toEqual(["Doran’s Shield"]);
    });

    it("still finds it when the minus sign is typed correctly", () => {
      expect(names({ search: "d:−1 might" })).toEqual(["Doran’s Shield"]);
    });

    it("keeps bracketed keyword searches precise", () => {
      // Two cards mention Equip; only one brackets it. The brackets must survive
      // the fold or this widens to both.
      expect(names({ search: "d:equip" })).toEqual(["Doran’s Shield", "Sterak’s Gage"]);
      expect(names({ search: "d:[equip]" })).toEqual(["Doran’s Shield"]);
    });

    it("does not join words across punctuation in prose", () => {
      // Squashing prose would make this match "damage. Draw". The control shows
      // the text really is there to be joined.
      expect(names({ search: "d:damage" })).toEqual(["Kai’Sa, Survivor", "Sterak’s Gage"]);
      expect(names({ search: "d:damagedraw" })).toEqual([]);
    });

    it("does not let a sentence boundary vanish", () => {
      expect(names({ search: 'd:"1 damage"' })).toEqual(["Kai’Sa, Survivor", "Sterak’s Gage"]);
      expect(names({ search: 'd:"damage draw"' })).toEqual([]);
    });
  });

  describe("flavor text", () => {
    it("finds an accented word typed without accents", () => {
      expect(names({ search: "f:epeeback" })).toEqual(["Doran’s Shield"]);
    });

    it("finds an apostrophe word typed with a straight quote", () => {
      expect(names({ search: "f:it's" })).toEqual(["Doran’s Shield"]);
    });

    it("folds the em dash to a hyphen", () => {
      expect(names({ search: "f:revenge-it" })).toEqual(["Doran’s Shield"]);
    });
  });

  describe("keywords, tags, artist and short code", () => {
    it("finds a hyphenated keyword typed without the hyphen", () => {
      expect(names({ search: "k:quickdraw" })).toEqual(["Doran’s Shield"]);
    });

    it("still finds it with the hyphen", () => {
      expect(names({ search: "k:quick-draw" })).toEqual(["Doran’s Shield"]);
    });

    it("finds a tag with a curly apostrophe typed straight", () => {
      expect(names({ search: "t:kha'zix" })).toEqual(["Doran’s Shield"]);
    });

    it("finds a short code typed without the hyphen", () => {
      expect(names({ search: "id:ogn269" })).toEqual(["Kai’Sa, Survivor"]);
    });

    it("keeps a CJK artist name searchable", () => {
      // normalizeNameForIdentity reduced this to "darkglow", losing the CJK half.
      expect(names({ search: "a:黯荧岛" })).toEqual(["Doran’s Shield"]);
    });

    it("finds the Latin half of a mixed-script artist name", () => {
      expect(names({ search: "a:dark glow" })).toEqual(["Doran’s Shield"]);
    });
  });

  describe("degenerate queries", () => {
    it("treats an apostrophe-only query as no search rather than matching all", () => {
      // The term folds to "", which an `includes` check would accept for every
      // card. parseSearchTerms drops it so the grid is simply unfiltered.
      expect(parseSearchTerms("'")).toEqual([]);
      expect(names({ search: "'" })).toHaveLength(printings.length);
    });

    it("drops a folded-away term but keeps its neighbours", () => {
      expect(names({ search: "dorans ’" })).toEqual(["Doran’s Shield"]);
    });

    it("keeps a hyphen-only term, which the fold does not remove", () => {
      expect(parseSearchTerms("-")).toEqual([
        { field: null, text: "-", folded: "-", squashed: "" },
      ]);
    });
  });

  describe("keyword translation reverse map", () => {
    it("resolves a translated label whose key was folded", () => {
      // buildTranslationReverseMap folds its keys, so the lookup here uses the
      // folded term rather than a merely lowercased one.
      const result = filterCards(
        printings,
        emptyFilters({ search: "k:护盾", searchScope: [...ALL_SEARCH_FIELDS] }),
        { keywordReverseMap: new Map([["护盾", "Shield"]]) },
      );
      expect(result.map((p) => p.card.name)).toEqual(["Kai’Sa, Survivor"]);
    });
  });
});

// ---------------------------------------------------------------------------
// filterCards — negation (exclude) dimensions + isStandard (ADR-034)
// ---------------------------------------------------------------------------

describe("filterCards negation", () => {
  it("excludes by scalar dimension (rarity)", () => {
    const cards = [
      makePrinting({ rarity: "common", card: { slug: "a" } }),
      makePrinting({ rarity: "rare", card: { slug: "b" } }),
    ];
    const result = filterCards(cards, emptyFilters({ raritiesExclude: ["common"] }));
    expect(result.map((p) => p.rarity)).toEqual(["rare"]);
  });

  it("excludes by set, language, type, art variant, finish", () => {
    const base = makePrinting();
    expect(filterCards([base], emptyFilters({ setsExclude: [base.setSlug] }))).toHaveLength(0);
    expect(filterCards([base], emptyFilters({ languagesExclude: ["EN"] }))).toHaveLength(0);
    expect(filterCards([base], emptyFilters({ typesExclude: ["unit"] }))).toHaveLength(0);
    expect(filterCards([base], emptyFilters({ artVariantsExclude: ["normal"] }))).toHaveLength(0);
    expect(filterCards([base], emptyFilters({ finishesExclude: ["normal"] }))).toHaveLength(0);
  });

  it("excludes by array dimension when any value overlaps (domains, superTypes)", () => {
    const card = makePrinting({
      card: { slug: "x", domains: ["fury", "calm"], superTypes: ["champion"] },
    });
    expect(filterCards([card], emptyFilters({ domainsExclude: ["calm"] }))).toHaveLength(0);
    expect(filterCards([card], emptyFilters({ domainsExclude: ["mind"] }))).toHaveLength(1);
    expect(filterCards([card], emptyFilters({ superTypesExclude: ["champion"] }))).toHaveLength(0);
  });

  it("exclude overrides include for the same value", () => {
    const cards = [
      makePrinting({ rarity: "common", card: { slug: "a" } }),
      makePrinting({ rarity: "rare", card: { slug: "b" } }),
    ];
    // Include common+rare, but exclude common → only rare survives.
    const result = filterCards(
      cards,
      emptyFilters({ rarities: ["common", "rare"], raritiesExclude: ["common"] }),
    );
    expect(result.map((p) => p.rarity)).toEqual(["rare"]);
  });

  it("tolerates a persisted filter missing a newer dimension", () => {
    // Regression: list rules (ADR-034) persist their filter as jsonb and are
    // re-hydrated with a bare JSON.parse. A rule saved before `keywordsExclude`
    // existed lacks the key, and `noneExcluded` used to throw on `undefined`.
    const card = makePrinting({ card: { slug: "a", keywords: ["Shield"] } });
    const stale = emptyFilters();
    // Drop a dimension the way an older persisted rule would not carry it.
    delete (stale as Partial<CardFilters>).keywordsExclude;
    expect(() => filterCards([card], stale)).not.toThrow();
    // Absent = no constraint, so the card still passes.
    expect(filterCards([card], stale)).toHaveLength(1);
  });
});

describe("filterCards isStandard", () => {
  const standard = makePrinting({ rarity: "common", finish: "normal", card: { slug: "std" } });
  const nonStandard = makePrinting({
    rarity: "common",
    finish: "foil",
    card: { slug: "nonstd" },
  });
  const cards = [standard, nonStandard];

  it("null = no constraint", () => {
    expect(filterCards(cards, emptyFilters({ isStandard: null }))).toHaveLength(2);
  });

  it("true = standard only", () => {
    const result = filterCards(cards, emptyFilters({ isStandard: true }));
    expect(result.map((p) => p.card.slug)).toEqual(["std"]);
  });

  it("false = non-standard only", () => {
    const result = filterCards(cards, emptyFilters({ isStandard: false }));
    expect(result.map((p) => p.card.slug)).toEqual(["nonstd"]);
  });
});

// ---------------------------------------------------------------------------
// getAvailableFilters
// ---------------------------------------------------------------------------

describe("getAvailableFilters", () => {
  const printings = [
    makePrinting({
      rarity: "epic",
      setSlug: "Set Alpha",
      artVariant: "altart",
      finish: "normal",
      cardId: "1",
      card: {
        name: "Test",
        type: "spell",
        superTypes: ["basic"],
        domains: ["mind", "chaos"],
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
      rarity: "common",
      setSlug: "Set Beta",
      artVariant: "normal",
      finish: "normal",
      cardId: "2",
      card: {
        name: "Test2",
        type: "unit",
        superTypes: ["champion"],
        domains: ["fury"],
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
      rarity: "rare",
      setSlug: "Set Alpha",
      artVariant: "normal",
      finish: "foil",
      cardId: "3",
      card: {
        name: "Test3",
        type: "unit",
        superTypes: [],
        domains: ["colorless"],
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
    expect(result.rarities).toEqual(["common", "rare", "epic"]);
  });

  it("sorts types by cardTypes order", () => {
    const result = getAvailableFilters(printings);
    expect(result.types).toEqual(["unit", "spell"]);
  });

  it("excludes Basic from superTypes", () => {
    const result = getAvailableFilters(printings);
    expect(result.superTypes).not.toContain("basic");
    expect(result.superTypes).toContain("champion");
  });

  it("sorts Colorless last in domains", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains.at(-1)).toBe("colorless");
  });

  it("lists individual domains from multi-domain cards", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains).toContain("mind");
    expect(result.domains).toContain("chaos");
  });

  it("sorts artVariants in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.artVariants).toEqual(["normal", "altart"]);
  });

  it("sorts finishes in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.finishes).toEqual(["normal", "foil"]);
  });

  it("surfaces card sizes in canonical order", () => {
    const result = getAvailableFilters([
      makePrinting({ id: "ovr", size: "oversized" }),
      makePrinting({ id: "std", size: "standard" }),
    ]);
    expect(result.cardSizes).toEqual(["standard", "oversized"]);
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

  it("computes hasNonStandard true when a non-standard printing exists", () => {
    const result = getAvailableFilters([
      makePrinting({ rarity: "common", finish: "normal", card: { slug: "a" } }),
      makePrinting({ rarity: "common", finish: "foil", card: { slug: "b" } }),
    ]);
    expect(result.hasNonStandard).toBe(true);
  });

  it("computes hasNonStandard false when every printing is standard", () => {
    const result = getAvailableFilters([makePrinting({ rarity: "common", finish: "normal" })]);
    expect(result.hasNonStandard).toBe(false);
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

  it("lists markers when marked printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
      }),
      makePrinting({ markers: [] }),
    ]);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].slug).toBe("promo");
  });

  it("lists no markers when no marked printings", () => {
    const result = getAvailableFilters([makePrinting({ markers: [] })]);
    expect(result.markers).toHaveLength(0);
  });

  it("handles printings with null energy/might/power", () => {
    const result = getAvailableFilters([
      makePrinting({
        cardId: "null-stats",
        card: {
          name: "Null Stats",
          type: "spell",
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
          type: "unit",
          superTypes: [],
          domains: ["fury", "mind"],
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
          type: "unit",
          superTypes: [],
          domains: ["mind", "chaos"],
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
    const mindCount = result.domains.filter((d) => d === "mind").length;
    expect(mindCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sortCards
// ---------------------------------------------------------------------------

describe("sortCards", () => {
  // Matches `makePrinting`'s default set, plus a second main set that sorts
  // after it despite its printings' alphabetically-earlier short codes.
  const SET_ALPHA_ID = "00000000-0000-0000-0000-0000000000a1";
  const SET_BETA_ID = "00000000-0000-0000-0000-0000000000a2";
  const SET_PROMO_ID = "00000000-0000-0000-0000-0000000000a3";
  const SETS = [
    { id: SET_ALPHA_ID, setType: "main" as const },
    { id: SET_BETA_ID, setType: "main" as const },
  ];

  const printings = [
    makePrinting({
      id: "SET1-003:epic:normal:",
      shortCode: "SET1-003",
      rarity: "epic",
      cardId: "SET1-003",
      card: {
        name: "Charlie",
        type: "unit",
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
      rarity: "common",
      cardId: "SET1-001",
      card: {
        name: "Alpha",
        type: "unit",
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
      rarity: "rare",
      cardId: "SET1-002",
      card: {
        name: "Bravo",
        type: "unit",
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

  it("files a Legend under its champion, not its stored epithet", () => {
    const azir = makePrinting({
      id: "SET1-004:epic:normal:",
      shortCode: "SET1-004",
      rarity: "epic",
      cardId: "SET1-004",
      card: {
        name: "Emperor of the Sands",
        type: "legend",
        types: ["legend"],
        superTypes: [],
        domains: [],
        energy: null,
        might: 0,
        power: 0,
        keywords: [],
        tags: ["Azir"],
        mightBonus: null,
        errata: null,
      },
    });
    const result = sortCards([...printings, azir], "name");
    // Between Alpha and Bravo as "Azir, …", not after Charlie as "Emperor …".
    expect(result.map((p) => p.card.name)).toEqual([
      "Alpha",
      "Emperor of the Sands",
      "Bravo",
      "Charlie",
    ]);
  });

  it("sorts by id (card number within one set)", () => {
    const result = sortCards(printings, "id", { sets: SETS });
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
  });

  it("sorts by id across sets in set order, not by the code's set prefix", () => {
    // "AAA" sorts ahead of "SET1" alphabetically, but Set Alpha comes first in
    // the catalog, so its printings lead.
    const beta = makePrinting({
      id: "AAA-001:common:normal:",
      shortCode: "AAA-001",
      setId: SET_BETA_ID,
      cardId: "AAA-001",
    });
    const result = sortCards([beta, ...printings], "id", { sets: SETS });
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-001", "SET1-002", "SET1-003", "AAA-001"]);
  });

  it("sorts a supplemental set's printings after the main sets", () => {
    const promo = makePrinting({
      id: "PRM-001:common:normal:",
      shortCode: "PRM-001",
      setId: SET_PROMO_ID,
      cardId: "PRM-001",
    });
    // The promo set leads the catalog array but is supplemental, so it still
    // sorts last — the same order the grid's set headers use.
    const result = sortCards([...printings, promo], "id", {
      sets: [{ id: SET_PROMO_ID, setType: "supplemental" }, ...SETS],
    });
    expect(result.at(-1)?.shortCode).toBe("PRM-001");
  });

  it("sorts a printing from an unknown set last", () => {
    const stray = makePrinting({
      id: "ZZZ-001:common:normal:",
      shortCode: "AAA-001",
      setId: "set-not-in-catalog",
      cardId: "ZZZ-001",
    });
    const result = sortCards([stray, ...printings], "id", { sets: SETS });
    expect(result.at(-1)?.setId).toBe("set-not-in-catalog");
  });

  it("breaks a name tie by set order, then card number", () => {
    const reprint = makePrinting({
      id: "AAA-009:common:normal:",
      shortCode: "AAA-009",
      setId: SET_BETA_ID,
      cardId: "AAA-009",
      card: { name: "Alpha" },
    });
    const alpha = printings.find((p) => p.card.name === "Alpha");
    const result = sortCards([reprint, alpha as typeof reprint], "name", { sets: SETS });
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-001", "AAA-009"]);
  });

  it("throws when sorting by id without the catalog's sets", () => {
    // The set half of a card ID can't be derived from the printing alone, so a
    // missing catalog is a programming error rather than a silent mis-sort.
    expect(() => sortCards(printings, "id")).toThrow("`sets` is required");
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
        rarity: "common",
        cardId: "c3",
        card: {
          name: "Zeta",
          type: "unit",
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
        rarity: "common",
        cardId: "c1",
        card: {
          name: "Alpha",
          type: "unit",
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
        rarity: "rare",
        cardId: "c2",
        card: {
          name: "Bravo",
          type: "unit",
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
            type: "unit",
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
          type: "unit",
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
            type: "unit",
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
              type: "unit",
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
              type: "unit",
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
            type: "unit",
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
            type: "unit",
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
            type: "unit",
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
              type: "unit",
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
              type: "unit",
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
            type: "spell",
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
            type: "unit",
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
            type: "unit",
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
            type: "unit",
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
            type: "unit",
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
            type: "spell",
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
            type: "unit",
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
            type: "spell",
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
            type: "spell",
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
            type: "unit",
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
    expect(sortCards([], "id", { sets: SETS })).toEqual([]);
    expect(sortCards([], "energy")).toEqual([]);
    expect(sortCards([], "rarity", { rarityOrder: TEST_ORDERS.rarities })).toEqual([]);
    expect(sortCards([], "price")).toEqual([]);
  });

  it("handles single-element array for all sort modes", () => {
    const single = [makePrinting({ cardId: "x", card: { name: "Solo" } })];
    expect(sortCards(single, "name")).toHaveLength(1);
    expect(sortCards(single, "id", { sets: SETS })).toHaveLength(1);
    expect(sortCards(single, "energy")).toHaveLength(1);
    expect(sortCards(single, "rarity", { rarityOrder: TEST_ORDERS.rarities })).toHaveLength(1);
    expect(sortCards(single, "price")).toHaveLength(1);
  });

  it("throws when sortBy is 'rarity' but no rarityOrder is supplied", () => {
    expect(() => sortCards([makePrinting()], "rarity")).toThrow(/rarityOrder/u);
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
      rarity: "common",
      card: { slug: "c1", domains: ["fury"] },
    }),
    makePrinting({
      id: "p2",
      cardId: "c1",
      language: "DE",
      rarity: "common",
      card: { slug: "c1", domains: ["fury"] },
    }),
    makePrinting({
      id: "p3",
      cardId: "c2",
      language: "EN",
      rarity: "rare",
      card: { slug: "c2", domains: ["calm"] },
    }),
    makePrinting({
      id: "p4",
      cardId: "c3",
      language: "JA",
      rarity: "rare",
      card: { slug: "c3", domains: ["mind", "body"] },
    }),
  ];

  it("counts printings per option when no filters are active", () => {
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "printing" });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
    expect(counts.languages.get("JA")).toBe(1);
    expect(counts.rarities.get("common")).toBe(2);
    expect(counts.rarities.get("rare")).toBe(2);
    expect(counts.domains.get("fury")).toBe(2);
    expect(counts.domains.get("mind")).toBe(1);
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
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(1);
  });

  it("ignores both the include and exclude of the faceted dimension", () => {
    // Excluding EN must not zero out the EN count in the language facet itself,
    // so the user can still un-exclude it (same widening rule as include).
    const counts = computeFilterCounts(sample, emptyFilters({ languagesExclude: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
  });

  it("a dimension's exclude narrows other dimensions' counts", () => {
    // Exclude all EN printings → only DE (c1 common) + JA (c3 rare) remain.
    const counts = computeFilterCounts(sample, emptyFilters({ languagesExclude: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(1);
  });

  it("counts the standard flag over the matching subset", () => {
    const cards = [
      makePrinting({ id: "s1", cardId: "s1", rarity: "common", finish: "normal" }),
      makePrinting({ id: "s2", cardId: "s2", rarity: "common", finish: "foil" }),
    ];
    const counts = computeFilterCounts(cards, emptyFilters(), { countBy: "printing" });
    expect(counts.flags.standard).toBe(1);
  });

  it("returns 0 (missing) for options with no matches under current filters", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["DE"] }), {
      countBy: "printing",
    });
    // Only c1's DE printing matches; rarity Rare and domains Calm/Mind/Body have 0 matches.
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare") ?? 0).toBe(0);
    expect(counts.domains.get("fury")).toBe(1);
    expect(counts.domains.get("calm") ?? 0).toBe(0);
  });

  it("counts unique cards (not printings) when countBy='card'", () => {
    // EN+DE printings of c1 should count once toward c1's domain "fury".
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("fury")).toBe(1);
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(2);
  });

  it("counts each domain of a multi-domain card", () => {
    // c3 has domains ["mind", "body"] — both should be counted.
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("mind")).toBe(1);
    expect(counts.domains.get("body")).toBe(1);
  });

  describe("markers and channels", () => {
    const channelStore = {
      id: "ch1",
      slug: "store",
      label: "Store",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const channelEvent = {
      id: "ch2",
      slug: "event",
      label: "Event",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const markerChannelSample = [
      makePrinting({
        id: "p1",
        cardId: "c1",
        rarity: "common",
        markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
        distributionChannels: [
          { channel: channelStore, distributionNote: null, ancestorLabels: [] },
        ],
      }),
      makePrinting({
        id: "p2",
        cardId: "c2",
        rarity: "rare",
        markers: [
          { id: "m1", slug: "promo", label: "Promo", description: null },
          { id: "m2", slug: "top-8", label: "Top 8", description: null },
        ],
        distributionChannels: [
          { channel: channelEvent, distributionNote: null, ancestorLabels: [] },
        ],
      }),
      makePrinting({
        id: "p3",
        cardId: "c3",
        rarity: "rare",
        markers: [],
        distributionChannels: [],
      }),
    ];

    it("counts printings per marker and per channel", () => {
      const counts = computeFilterCounts(markerChannelSample, emptyFilters(), {
        countBy: "printing",
      });
      expect(counts.markers.get("promo")).toBe(2);
      expect(counts.markers.get("top-8")).toBe(1);
      expect(counts.channels.get("store")).toBe(1);
      expect(counts.channels.get("event")).toBe(1);
    });

    it("excludes the marker dim's own filter so multi-select still widens", () => {
      const counts = computeFilterCounts(
        markerChannelSample,
        emptyFilters({ markerSlugs: ["top-8"] }),
        { countBy: "printing" },
      );
      // promo stays at 2 even though top-8 is selected — picking another marker
      // must still widen results.
      expect(counts.markers.get("promo")).toBe(2);
      expect(counts.markers.get("top-8")).toBe(1);
    });

    it("narrows channels based on an active marker filter", () => {
      const counts = computeFilterCounts(
        markerChannelSample,
        emptyFilters({ markerSlugs: ["top-8"] }),
        { countBy: "printing" },
      );
      // Only p2 (event) carries the top-8 marker.
      expect(counts.channels.get("event")).toBe(1);
      expect(counts.channels.get("store") ?? 0).toBe(0);
    });
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
          bans: [
            {
              formatId: "f1",
              formatName: "Standard",
              bannedAt: "2026-01-01",
              reason: "test",
            },
          ],
          errata: {
            correctedRulesText: "x",
            correctedEffectText: null,
            source: "test",
            sourceUrl: null,
            effectiveDate: null,
          },
        },
      }),
      makePrinting({
        id: "p-promo",
        cardId: "c-promo",
        isSigned: false,
        markers: [{ id: "m1", slug: "promo-stamp", label: "Promo", description: null }],
        card: { slug: "c-promo", bans: [], errata: null },
      }),
    ];

    it("counts flags at their primary-on state when the chip is null/true", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters(), { countBy: "printing" });
      expect(counts.flags.signed).toBe(1); // only p-signed has isSigned=true
      expect(counts.presence.markers.any).toBe(1); // only p-promo has any marker
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
      const counts = computeFilterCounts(flagSample, emptyFilters({ domains: ["calm"] }), {
        countBy: "printing",
      });
      expect(counts.flags.signed).toBe(0);
      expect(counts.presence.markers.any).toBe(0);
      expect(counts.flags.banned).toBe(0);
      expect(counts.flags.errata).toBe(0);
    });
  });

  describe("presence counts", () => {
    const presenceSample = [
      makePrinting({
        id: "pm1",
        cardId: "cm1",
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        card: { slug: "cm1", keywords: ["Shield"] },
      }),
      makePrinting({
        id: "pm2",
        cardId: "cm2",
        markers: [{ id: "2", slug: "top-8", label: "Top 8", description: null }],
        card: { slug: "cm2", keywords: [] },
      }),
      makePrinting({
        id: "pm3",
        cardId: "cm3",
        markers: [],
        card: { slug: "cm3", keywords: [] },
      }),
    ];

    it("partitions each dimension into any / none", () => {
      const counts = computeFilterCounts(presenceSample, emptyFilters(), { countBy: "printing" });
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
      expect(counts.presence.keywords).toEqual({ any: 1, none: 2 });
    });

    it("ignores the dimension's own presence selection so counts still widen", () => {
      // Selecting markers=none must not collapse the markers any/none counts.
      const counts = computeFilterCounts(
        presenceSample,
        emptyFilters({ presence: { markers: "none" } }),
        { countBy: "printing" },
      );
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
    });

    it("ignores the dimension's own value selection when counting presence", () => {
      // A specific marker selected must not skew markers presence counts.
      const counts = computeFilterCounts(presenceSample, emptyFilters({ markerSlugs: ["promo"] }), {
        countBy: "printing",
      });
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
    });

    it("respects other active filters", () => {
      const counts = computeFilterCounts(
        presenceSample,
        emptyFilters({ presence: { keywords: "any" } }),
        { countBy: "printing" },
      );
      // keywords=any leaves only cm1, which has a marker.
      expect(counts.presence.markers).toEqual({ any: 1, none: 0 });
    });
  });

  describe("ranges", () => {
    const rangeSample = [
      makePrinting({
        id: "rp1",
        cardId: "rc1",
        rarity: "common",
        card: { slug: "rc1", energy: 1, might: 2, power: 3 },
      }),
      makePrinting({
        id: "rp2",
        cardId: "rc2",
        rarity: "rare",
        card: { slug: "rc2", energy: 5, might: 4, power: 7 },
      }),
      makePrinting({
        id: "rp3",
        cardId: "rc3",
        rarity: "rare",
        card: { slug: "rc3", energy: null, might: null, power: null },
      }),
    ];

    it("returns the full bounds when no filters narrow the set", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters(), { countBy: "printing" });
      expect(counts.ranges.energy).toEqual({ min: 1, max: 5, hasNullStat: true });
      expect(counts.ranges.might).toEqual({ min: 2, max: 4, hasNullStat: true });
      expect(counts.ranges.power).toEqual({ min: 3, max: 7, hasNullStat: true });
    });

    it("narrows bounds based on other active filters", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters({ rarities: ["common"] }), {
        countBy: "printing",
      });
      expect(counts.ranges.energy).toEqual({ min: 1, max: 1, hasNullStat: false });
      expect(counts.ranges.might).toEqual({ min: 2, max: 2, hasNullStat: false });
    });

    it("ignores its own filter so the slider can still drag outward", () => {
      // With energy clamped to 1..1, the energy bounds should still reflect
      // the catalog (1..5) so the user can drag the upper handle out.
      const counts = computeFilterCounts(
        rangeSample,
        emptyFilters({ energy: { min: 1, max: 1 } }),
        { countBy: "printing" },
      );
      expect(counts.ranges.energy).toEqual({ min: 1, max: 5, hasNullStat: true });
    });

    it("returns 0..0 price bounds when no getPrice resolver is supplied", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters(), { countBy: "printing" });
      expect(counts.ranges.price).toEqual({ min: 0, max: 0 });
    });
  });
});
