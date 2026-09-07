import { describe, expect, it } from "vitest";

import {
  apiErrorResponseSchema,
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
  deckLinkSchema,
} from "./response-schemas.js";

const validSet = {
  id: "019cfc3b-0369-7890-a450-7859471cc3f6",
  slug: "OGN",
  name: "Origins",
  releases: {
    EN: { releasedAt: "2025-10-31", precision: "day" },
    FR: { releasedAt: null, precision: null },
  },
  setType: "main",
};

const validCard = {
  id: "019cfc3b-0389-744b-837c-792fd586300e",
  slug: "jinx-rebel",
  name: "Jinx, Rebel",
  type: "Unit",
  types: ["Unit"],
  superTypes: ["Champion"],
  domains: ["Chaos"],
  tokenCardIds: [],
  might: 5,
  energy: 5,
  power: null,
  keywords: [],
  tags: [],
  mightBonus: null,
  maxCopiesOverride: null,
  errata: null,
  bans: [],
};

const validPrinting = {
  id: "019cfc3b-03d3-7dac-86c9-27900cd43727",
  shortCode: "OGN-202",
  setId: "019cfc3b-0369-7890-a450-7859471cc3f6",
  rarity: "Epic",
  artVariant: "normal",
  isSigned: false,
  isOvernumbered: false,
  markers: [],
  distributionChannels: [],
  finish: "foil",
  size: "standard",
  images: [{ face: "front", imageId: "019d02f1-d14f-769f-9295-9852db692dbe" }],
  artist: "Kudos Productions",
  publicCode: "OGN-202/298",
  printedRulesText: null,
  printedEffectText: null,
  flavorText: null,
  printedName: null,
  printedYear: 2025,
  language: "EN",
  comment: null,
  canonicalRank: 1,
  cardId: "019cfc3b-0389-744b-837c-792fd586300e",
};

describe("catalogSetResponseSchema", () => {
  it("accepts a set with a release period per language", () => {
    expect(catalogSetResponseSchema.parse(validSet)).toEqual(validSet);
  });

  it("rejects a set type outside main and supplemental", () => {
    expect(catalogSetResponseSchema.safeParse({ ...validSet, setType: "promo" }).success).toBe(
      false,
    );
  });

  it("rejects a release precision it does not know", () => {
    expect(
      catalogSetResponseSchema.safeParse({
        ...validSet,
        releases: { EN: { releasedAt: "2025-10-31", precision: "week" } },
      }).success,
    ).toBe(false);
  });
});

describe("catalogCardResponseSchema", () => {
  it("accepts a fully populated card", () => {
    expect(catalogCardResponseSchema.parse(validCard)).toEqual(validCard);
  });

  it("accepts an errata block with its nullable fields filled in", () => {
    const withErrata = {
      ...validCard,
      errata: {
        correctedRulesText: "Deals 3 damage.",
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: null,
        effectiveDate: "2026-01-15",
      },
    };
    expect(catalogCardResponseSchema.parse(withErrata)).toEqual(withErrata);
  });

  it("rejects a card with no types", () => {
    expect(catalogCardResponseSchema.safeParse({ ...validCard, types: [] }).success).toBe(false);
  });

  it("rejects a missing nullable stat rather than defaulting it", () => {
    const { might: _might, ...withoutMight } = validCard;
    expect(catalogCardResponseSchema.safeParse(withoutMight).success).toBe(false);
  });
});

describe("catalogPrintingResponseSchema", () => {
  it("accepts a printing without its optional keys", () => {
    expect(catalogPrintingResponseSchema.parse(validPrinting)).toEqual(validPrinting);
  });

  it("accepts the optional foil-twin, citation and fallback keys", () => {
    const enriched = {
      ...validPrinting,
      hasFoilTwin: true,
      citations: [{ id: "c1", label: "Launch party unboxing", sourceUrl: null }],
      fallbackArtMode: "pinned",
      fallbackImageId: "019cfc3b-03d3-7dac-86c9-27900cd43727",
    };
    expect(catalogPrintingResponseSchema.parse(enriched)).toEqual(enriched);
  });

  it("rejects an explicit false for the omit-when-absent foil twin", () => {
    expect(
      catalogPrintingResponseSchema.safeParse({ ...validPrinting, hasFoilTwin: false }).success,
    ).toBe(false);
  });

  it("rejects a fractional printed year", () => {
    expect(
      catalogPrintingResponseSchema.safeParse({ ...validPrinting, printedYear: 2025.5 }).success,
    ).toBe(false);
  });

  it("rejects a card face outside front and back", () => {
    expect(
      catalogPrintingResponseSchema.safeParse({
        ...validPrinting,
        images: [{ face: "side", imageId: "019d02f1-d14f-769f-9295-9852db692dbe" }],
      }).success,
    ).toBe(false);
  });
});

describe("deckLinkSchema", () => {
  it("accepts an https link to an allowlisted host", () => {
    expect(
      deckLinkSchema.parse({ url: "https://www.youtube.com/watch?v=abc", title: "VOD" }),
    ).toEqual({ url: "https://www.youtube.com/watch?v=abc", title: "VOD" });
  });

  it("accepts an allowlisted link without a title", () => {
    expect(deckLinkSchema.safeParse({ url: "https://openrift.app/decks/1" }).success).toBe(true);
  });

  it("rejects a host that is not on the allowlist", () => {
    expect(deckLinkSchema.safeParse({ url: "https://example.com/deck" }).success).toBe(false);
  });

  it("rejects http even for an allowlisted host", () => {
    expect(deckLinkSchema.safeParse({ url: "http://openrift.app/decks/1" }).success).toBe(false);
  });

  it("rejects a title longer than sixty characters", () => {
    expect(
      deckLinkSchema.safeParse({ url: "https://openrift.app/decks/1", title: "x".repeat(61) })
        .success,
    ).toBe(false);
  });
});

describe("apiErrorResponseSchema", () => {
  it("accepts a known error code", () => {
    expect(apiErrorResponseSchema.parse({ error: "Not found", code: "NOT_FOUND" })).toEqual({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("rejects a code outside the shared error-code table", () => {
    expect(apiErrorResponseSchema.safeParse({ error: "Teapot", code: "IM_A_TEAPOT" }).success).toBe(
      false,
    );
  });
});
