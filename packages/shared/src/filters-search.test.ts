import { describe, expect, it } from "vitest";

import { parseSearchTerms, searchPrefixFields } from "./filters-search.js";
import { emptyFilters, makePrinting } from "./filters-test-helpers.js";
import { filterCards } from "./filters.js";
import type { CardFilters } from "./types/search.js";
import { ALL_SEARCH_FIELDS } from "./types/search.js";

/** Folded/squashed forms are covered separately in `search-fold.test.ts`. */
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
    expect(terms("n:")).toEqual([]);
  });

  it("parses prefix followed by whitespace as empty (ignored)", () => {
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

describe("searchPrefixFields", () => {
  it("reports no fields for a query without prefixes", () => {
    expect(searchPrefixFields("fire dragon")).toEqual([]);
  });

  it("reports the field of a prefix that has no term yet", () => {
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
      // Stored as U+2212, the actual minus sign, not an ASCII hyphen.
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
      // Squashing prose would incorrectly match "damage. Draw".
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
      // normalizeNameForIdentity strips CJK characters, keeping only the Latin half.
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
      // buildTranslationReverseMap folds its keys; the lookup must use the
      // folded term, not a merely lowercased one.
      const result = filterCards(
        printings,
        emptyFilters({ search: "k:护盾", searchScope: [...ALL_SEARCH_FIELDS] }),
        { keywordReverseMap: new Map([["护盾", "Shield"]]) },
      );
      expect(result.map((p) => p.card.name)).toEqual(["Kai’Sa, Survivor"]);
    });
  });
});
