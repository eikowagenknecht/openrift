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
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    setSlug: "Set Alpha",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    promoType: null,
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
    promoTypes: [],
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
      shortCode: "SET1-002",
      setSlug: "Set Alpha",
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
      shortCode: "SET2-001a",
      setSlug: "Set Beta",
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

  // -- promoType filter --

  it("filters by isPromo=true", () => {
    const withPromo = [
      makePrinting({
        promoType: { id: "1", slug: "promo", label: "Promo" },
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
        promoType: null,
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

  // -- Edge cases: null artVariant defaults to "normal" --

  it("treats null artVariant as normal when filtering", () => {
    const nullArtVariant = [
      makePrinting({
        artVariant: null as unknown as "normal",
        card: { id: "nav", name: "Null Art Card" },
      }),
    ];
    const result = filterCards(nullArtVariant, emptyFilters({ artVariants: ["normal"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Null Art Card");
  });

  // -- Edge cases: card text search with null rulesText/effectText --

  it("card text search handles null rulesText and effectText", () => {
    const nullTextCard = [
      makePrinting({
        card: {
          id: "nt",
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
          rulesText: null,
          effectText: null,
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
        card: { id: "s1", name: "Signed Card" },
      }),
      makePrinting({
        isSigned: false,
        card: { id: "s2", name: "Unsigned Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isSigned: false }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Unsigned Card");
  });

  // -- Edge cases: isPromo filter set to false --

  it("filters by isPromo=false excludes promo cards", () => {
    const cards = [
      makePrinting({
        promoType: { id: "1", slug: "promo", label: "Promo" },
        card: { id: "p1", name: "Promo Card" },
      }),
      makePrinting({
        promoType: null,
        card: { id: "p2", name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isPromo: false }));
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
        card: {
          id: "ne",
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
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ energy: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
  });

  it("excludes cards with null might when might filter is active", () => {
    const cards = [
      makePrinting({
        card: {
          id: "nm",
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
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ might: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
  });

  it("excludes cards with null power when power filter is active", () => {
    const cards = [
      makePrinting({
        card: {
          id: "np",
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
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ power: { min: 0, max: 10 } }));
    expect(result).toHaveLength(0);
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

  it("card text search matches effectText only (not rulesText)", () => {
    const cards = [
      makePrinting({
        card: {
          id: "et",
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
          rulesText: null,
          effectText: "Unique effect text here",
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

  // -- promoType filter: detailed branch coverage --

  it("filters by promoTypes when isPromo is null (type-only filter)", () => {
    const cards = [
      makePrinting({
        promoType: { id: "1", slug: "nexus-night", label: "Nexus Night" },
        card: { id: "p1", name: "Nexus Card" },
      }),
      makePrinting({
        promoType: { id: "2", slug: "launch-day", label: "Launch Day" },
        card: { id: "p2", name: "Launch Card" },
      }),
      makePrinting({
        promoType: null,
        card: { id: "p3", name: "Regular Card" },
      }),
    ];
    // isPromo null + promoTypes = filter by slug only
    const result = filterCards(cards, emptyFilters({ isPromo: null, promoTypes: ["nexus-night"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Nexus Card");
  });

  it("filters by isPromo=true with specific promoTypes", () => {
    const cards = [
      makePrinting({
        promoType: { id: "1", slug: "nexus-night", label: "Nexus Night" },
        card: { id: "p1", name: "Nexus Card" },
      }),
      makePrinting({
        promoType: { id: "2", slug: "launch-day", label: "Launch Day" },
        card: { id: "p2", name: "Launch Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isPromo: true, promoTypes: ["nexus-night"] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Nexus Card");
  });

  it("filters by isPromo=true with empty promoTypes returns all promos", () => {
    const cards = [
      makePrinting({
        promoType: { id: "1", slug: "nexus-night", label: "Nexus Night" },
        card: { id: "p1", name: "Nexus Card" },
      }),
      makePrinting({
        promoType: null,
        card: { id: "p2", name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isPromo: true, promoTypes: [] }));
    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Nexus Card");
  });

  it("promoTypes filter excludes non-promo cards when isPromo is null", () => {
    const cards = [
      makePrinting({
        promoType: null,
        card: { id: "r", name: "Regular Card" },
      }),
    ];
    const result = filterCards(cards, emptyFilters({ isPromo: null, promoTypes: ["nexus-night"] }));
    expect(result).toHaveLength(0);
  });

  // -- Range edge case: value below min --

  it("excludes value below min in range filter", () => {
    const cards = [
      makePrinting({
        card: {
          id: "low",
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
          rulesText: "",
          effectText: "",
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
        card: {
          id: "high",
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
          rulesText: "",
          effectText: "",
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
      setSlug: "Set Beta",
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
      setSlug: "Set Alpha",
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

  it("computes hasPromo true when promo printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({ promoType: { id: "1", slug: "promo", label: "Promo" } }),
      makePrinting({ promoType: null }),
    ]);
    expect(result.hasPromo).toBe(true);
    expect(result.promoTypes).toHaveLength(1);
    expect(result.promoTypes[0].slug).toBe("promo");
  });

  it("computes hasPromo false when no promo printings", () => {
    const result = getAvailableFilters([makePrinting({ promoType: null })]);
    expect(result.hasPromo).toBe(false);
    expect(result.promoTypes).toHaveLength(0);
  });

  it("handles printings with null energy/might/power", () => {
    const result = getAvailableFilters([
      makePrinting({
        card: {
          id: "null-stats",
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
          rulesText: "",
          effectText: "",
        },
      }),
    ]);
    expect(result.energy).toEqual({ min: 0, max: 0 });
    expect(result.might).toEqual({ min: 0, max: 0 });
    expect(result.power).toEqual({ min: 0, max: 0 });
  });

  it("handles null artVariant by treating it as normal", () => {
    const result = getAvailableFilters([makePrinting({ artVariant: null as unknown as "normal" })]);
    expect(result.artVariants).toContain("normal");
  });

  it("deduplicates domains from multiple printings", () => {
    const result = getAvailableFilters([
      makePrinting({
        card: {
          id: "1",
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
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        card: {
          id: "2",
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
          rulesText: "",
          effectText: "",
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
      shortCode: "SET1-001",
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
      shortCode: "SET1-002",
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

  it("sorts by id (shortCode string comparison)", () => {
    const result = sortCards(printings, "id");
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-001", "SET1-002", "SET1-003"]);
  });

  it("sorts by energy, breaking ties by name", () => {
    const result = sortCards(printings, "energy");
    // Alpha(2) and Bravo(2) tied → alphabetical; then Charlie(5)
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by rarity using RARITY_ORDER, breaking ties by shortCode", () => {
    const result = sortCards(printings, "rarity");
    expect(result.map((p) => p.card.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("keeps shortCode tiebreaker ascending when rarity sort is desc", () => {
    const tied = [
      makePrinting({
        shortCode: "SET1-003",
        rarity: "Common",
        card: {
          id: "c3",
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
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        shortCode: "SET1-001",
        rarity: "Common",
        card: {
          id: "c1",
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
          rulesText: "",
          effectText: "",
        },
      }),
      makePrinting({
        shortCode: "SET1-002",
        rarity: "Rare",
        card: {
          id: "c2",
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
          rulesText: "",
          effectText: "",
        },
      }),
    ];
    // desc reverses rarity (Rare first) but tiebreaker stays ascending
    const result = sortCards(tied, "rarity", "desc");
    expect(result.map((p) => p.shortCode)).toEqual(["SET1-002", "SET1-001", "SET1-003"]);
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

  describe("energy sort with null values", () => {
    it("pushes null energy to the end", () => {
      const energyPrintings = [
        makePrinting({
          card: {
            id: "n",
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
            rulesText: "",
            effectText: "",
          },
        }),
        makePrinting({
          card: {
            id: "l",
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
            rulesText: "",
            effectText: "",
          },
        }),
      ];
      const result = sortCards(energyPrintings, "energy");
      expect(result.map((p) => p.card.name)).toEqual(["Low Energy", "No Energy"]);
    });

    it("sorts non-null energy before null, null by name", () => {
      const energyPrintings = [
        makePrinting({
          card: {
            id: "z",
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
            rulesText: "",
            effectText: "",
          },
        }),
        makePrinting({
          card: {
            id: "a",
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
            rulesText: "",
            effectText: "",
          },
        }),
        makePrinting({
          card: {
            id: "h",
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
            rulesText: "",
            effectText: "",
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
    expect(sortCards([], "rarity")).toEqual([]);
    expect(sortCards([], "price")).toEqual([]);
  });

  it("handles single-element array for all sort modes", () => {
    const single = [makePrinting({ card: { id: "x", name: "Solo" } })];
    expect(sortCards(single, "name")).toHaveLength(1);
    expect(sortCards(single, "id")).toHaveLength(1);
    expect(sortCards(single, "energy")).toHaveLength(1);
    expect(sortCards(single, "rarity")).toHaveLength(1);
    expect(sortCards(single, "price")).toHaveLength(1);
  });
});
