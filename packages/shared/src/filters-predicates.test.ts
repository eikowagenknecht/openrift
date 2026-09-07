import { describe, expect, it } from "vitest";

import { getAvailableFilters as getAvailableFiltersRaw } from "./filters-available.js";
import { computeFilterCounts } from "./filters-counts.js";
import { emptyFilters, makePrinting, TEST_ORDERS } from "./filters-test-helpers.js";
import { filterCards } from "./filters.js";
import type { Printing } from "./types/catalog.js";
import type { CardFilters } from "./types/search.js";

function getAvailableFilters(
  printings: Printing[],
  options: Partial<Parameters<typeof getAvailableFiltersRaw>[1]> = {},
) {
  return getAvailableFiltersRaw(printings, { orders: TEST_ORDERS, ...options });
}

describe("filterCards predicates", () => {
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

    const withMarker = makePrinting({
      cardId: "has-marker",
      markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
    });
    const withoutMarker = makePrinting({ cardId: "no-marker", markers: [] });
    const withSuperType = makePrinting({ cardId: "has-super", card: { superTypes: ["champion"] } });
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
    expect(result[0]!.card.name).toBe("A");
  });

  it("customTagSlugs filter with missing assignment map excludes everything", () => {
    const cards = [makePrinting({ cardId: "a", card: { name: "A" } })];
    const result = filterCards(cards, emptyFilters({ customTagSlugs: ["bandle-city"] }));
    expect(result).toHaveLength(0);
  });

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
    const result = filterCards(
      cards,
      emptyFilters({ rarities: ["common", "rare"], raritiesExclude: ["common"] }),
    );
    expect(result.map((p) => p.rarity)).toEqual(["rare"]);
  });

  it("tolerates a persisted filter missing a newer dimension", () => {
    // Filters persist as jsonb and rehydrate via a bare JSON.parse, so a rule
    // saved before a dimension existed lacks that key entirely.
    const card = makePrinting({ card: { slug: "a", keywords: ["Shield"] } });
    const stale = emptyFilters();
    delete (stale as Partial<CardFilters>).keywordsExclude;
    expect(() => filterCards([card], stale)).not.toThrow();
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
