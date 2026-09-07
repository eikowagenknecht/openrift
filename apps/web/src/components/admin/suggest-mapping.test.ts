import { describe, expect, it } from "vitest";

import type {
  MarketplaceAssignment,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "@/lib/price-mappings-types";

import { computeProductSuggestions, productSuggestionKey } from "./suggest-mapping";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-normal",
    setId: "ogn",
    shortCode: "OGN-001",
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    isOvernumbered: false,
    markerSlugs: [],
    finish: "normal",
    size: "standard",
    language: "EN",
    imageUrl: null,
    tcgExternalId: null,
    cmExternalId: null,
    ctExternalId: null,
    ...overrides,
  };
}

function staged(overrides: Partial<StagedProduct> = {}): StagedProduct {
  return {
    externalId: 1,
    productName: "Ahri",
    finish: "normal",
    language: "EN",
    marketCents: 100,
    lowCents: null,
    midCents: null,
    highCents: null,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
    currency: "USD",
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

function group(
  printings: UnifiedMappingPrinting[],
  perMarketplace: Partial<{
    tcgplayer: {
      staged: StagedProduct[];
      assigned?: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
    cardmarket: {
      staged: StagedProduct[];
      assigned?: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
    cardtrader: {
      staged: StagedProduct[];
      assigned?: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
  }> = {},
  cardName = "Ahri",
): UnifiedMappingGroup {
  const empty = { staged: [], assignments: [] };
  const tcg = { ...empty, ...perMarketplace.tcgplayer };
  const cm = { ...empty, ...perMarketplace.cardmarket };
  const ct = { ...empty, ...perMarketplace.cardtrader };
  return {
    cardId: "c-1",
    cardSlug: "ahri",
    cardName,
    superTypes: [],
    domains: ["fury"],
    energy: 2,
    might: 3,
    setId: "set-1",
    setName: "Origins",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: {
      stagedProducts: tcg.staged,
      assignedProducts: tcg.assigned ?? [],
      assignments: tcg.assignments,
    },
    cardmarket: {
      stagedProducts: cm.staged,
      assignedProducts: cm.assigned ?? [],
      assignments: cm.assignments,
    },
    cardtrader: {
      stagedProducts: ct.staged,
      assignedProducts: ct.assigned ?? [],
      assignments: ct.assignments,
    },
  };
}

describe("computeProductSuggestions", () => {
  it("returns nothing when there are no staged products", () => {
    const result = computeProductSuggestions(group([printing()]));
    expect(result.size).toBe(0);
  });

  it("suggests the normal printing for a name-matching normal-finish product", () => {
    const normal = printing({ printingId: "p-normal", artVariant: "normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        tcgplayer: {
          staged: [staged({ externalId: 101, productName: "Ahri", finish: "normal" })],
          assignments: [],
        },
      }),
    );
    const key = productSuggestionKey("tcgplayer", 101, "normal", "EN");
    expect(result.get(key)?.[0]?.printingId).toBe("p-normal");
  });

  it("skips products whose finish doesn't match any unmapped printing", () => {
    const normal = printing({ printingId: "p-normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        tcgplayer: {
          staged: [staged({ externalId: 301, productName: "Ahri", finish: "foil" })],
          assignments: [],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("treats printings with an existing marketplace assignment as already mapped", () => {
    const normal = printing({ printingId: "p-normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        cardtrader: {
          staged: [staged({ externalId: 401, productName: "Ahri", finish: "normal" })],
          assignments: [
            { externalId: 999, printingId: "p-normal", finish: "normal", language: "EN" },
          ],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("scopes suggestions per marketplace even when the same externalId appears in multiple", () => {
    const normal = printing({ printingId: "p-normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        tcgplayer: {
          staged: [staged({ externalId: 500, productName: "Ahri" })],
          assignments: [],
        },
        cardmarket: {
          staged: [staged({ externalId: 500, productName: "Ahri" })],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 500, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-normal");
    expect(
      result.get(productSuggestionKey("cardmarket", 500, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-normal");
  });

  it("does not suggest a CardTrader product across a language mismatch", () => {
    const enPrinting = printing({ printingId: "p-en", language: "EN", finish: "foil" });
    const result = computeProductSuggestions(
      group([enPrinting], {
        cardtrader: {
          staged: [
            staged({ externalId: 379_529, productName: "Ahri", finish: "foil", language: "SC" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("still suggests CardTrader products whose language matches the printing", () => {
    const scPrinting = printing({ printingId: "p-sc", language: "SC", finish: "foil" });
    const result = computeProductSuggestions(
      group([scPrinting], {
        cardtrader: {
          staged: [
            staged({ externalId: 379_529, productName: "Ahri", finish: "foil", language: "SC" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("cardtrader", 379_529, "foil", "SC"))?.[0]?.printingId,
    ).toBe("p-sc");
  });

  it("still suggests CM products across languages (that staging pool is EN-only)", () => {
    const scPrinting = printing({ printingId: "p-sc", language: "SC", finish: "foil" });
    const result = computeProductSuggestions(
      group([scPrinting], {
        cardmarket: {
          staged: [
            staged({ externalId: 888, productName: "Ahri", finish: "foil", language: "EN" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 888, "foil", "EN"))?.[0]?.printingId).toBe(
      "p-sc",
    );
  });

  it("never suggests a non-EN printing for TCGplayer, which stocks English only", () => {
    const scPrinting = printing({ printingId: "p-sc", language: "SC", finish: "foil" });
    const result = computeProductSuggestions(
      group([scPrinting], {
        tcgplayer: {
          staged: [
            staged({ externalId: 888, productName: "Ahri", finish: "foil", language: "EN" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("tcgplayer", 888, "foil", "EN"))).toBeUndefined();
  });

  it("suggests only the EN sibling for a language-aggregate TCG product", () => {
    const en = printing({ printingId: "p-en", language: "EN" });
    const sc = printing({ printingId: "p-sc", language: "SC" });
    const result = computeProductSuggestions(
      group([en, sc], {
        tcgplayer: {
          staged: [
            staged({
              externalId: 847_346,
              productName: "Acceptable Losses",
              finish: "normal",
              language: null,
            }),
          ],
          assignments: [],
        },
      }),
    );
    const suggested = result
      .get(productSuggestionKey("tcgplayer", 847_346, "normal", null))
      ?.map((s) => s.printingId);
    expect(suggested).toEqual(["p-en"]);
  });

  it("suggests a metal printing for a foil-staging product whose name contains 'Metal'", () => {
    const metal = printing({ printingId: "p-metal", finish: "metal" });
    const result = computeProductSuggestions(
      group([metal], {
        tcgplayer: {
          staged: [staged({ externalId: 801, productName: "Ahri Metal", finish: "foil" })],
          assignments: [],
        },
      }),
    );
    const entry = result.get(productSuggestionKey("tcgplayer", 801, "foil", "EN"));
    expect(entry?.[0]?.printingId).toBe("p-metal");
  });

  it("routes the Metal-titled product to the metal printing and leaves the plain foil ambiguous", () => {
    const foil = printing({ printingId: "p-foil", finish: "foil" });
    const metal = printing({ printingId: "p-metal", finish: "metal" });
    const result = computeProductSuggestions(
      group([foil, metal], {
        tcgplayer: {
          staged: [
            staged({ externalId: 900, productName: "Ahri", finish: "foil" }),
            staged({ externalId: 901, productName: "Ahri Metal", finish: "foil" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("tcgplayer", 900, "foil", "EN"))).toBeUndefined();
    expect(result.get(productSuggestionKey("tcgplayer", 901, "foil", "EN"))?.[0]?.printingId).toBe(
      "p-metal",
    );
  });

  it("also accepts metal-deluxe printings for foil staging", () => {
    const metalDeluxe = printing({ printingId: "p-md", finish: "metal-deluxe" });
    const result = computeProductSuggestions(
      group([metalDeluxe], {
        tcgplayer: {
          staged: [staged({ externalId: 910, productName: "Ahri Metal Deluxe", finish: "foil" })],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 910, "foil", "EN"))?.map((s) => s.printingId),
    ).toEqual(["p-md"]);
  });

  it("still rejects foil staging for a normal printing (equivalence class does not include normal)", () => {
    const normal = printing({ printingId: "p-normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        tcgplayer: {
          staged: [staged({ externalId: 920, productName: "Ahri", finish: "foil" })],
          assignments: [],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("skips when multiple printings tie for the same Cardmarket product (mutual-best-match)", () => {
    const enSfd = printing({ printingId: "p-sfd-en", language: "EN" });
    const scSfd = printing({ printingId: "p-sfd-sc", language: "SC" });
    const scOgn = printing({ printingId: "p-ogn-sc", language: "SC", shortCode: "OGN-042" });
    const result = computeProductSuggestions(
      group([enSfd, scSfd, scOgn], {
        cardmarket: {
          staged: [staged({ externalId: 872_479, productName: "Calm Rune", finish: "normal" })],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 872_479, "normal", "EN"))).toBeUndefined();
  });

  it("still suggests when only one printing matches a Cardmarket product", () => {
    const en = printing({ printingId: "p-en", language: "EN" });
    const result = computeProductSuggestions(
      group([en], {
        cardmarket: {
          staged: [staged({ externalId: 872_479, productName: "Calm Rune", finish: "normal" })],
          assignments: [],
        },
      }),
    );
    expect(
      result
        .get(productSuggestionKey("cardmarket", 872_479, "normal", "EN"))
        ?.map((s) => s.printingId),
    ).toEqual(["p-en"]);
  });

  it("suggests every sibling printing for a language-aggregate CM product", () => {
    const en = printing({ printingId: "p-en", language: "EN" });
    const sc = printing({ printingId: "p-sc", language: "SC" });
    const result = computeProductSuggestions(
      group([en, sc], {
        cardmarket: {
          staged: [
            staged({
              externalId: 847_346,
              productName: "Acceptable Losses",
              finish: "normal",
              language: null,
            }),
          ],
          assignments: [],
        },
      }),
    );
    const suggested = result
      .get(productSuggestionKey("cardmarket", 847_346, "normal", null))
      ?.map((s) => s.printingId)
      .toSorted();
    expect(suggested).toEqual(["p-en", "p-sc"]);
  });

  it("breaks a CardTrader SC tie using the short_code already bound to the EN SKU", () => {
    const ognOverEn = printing({
      printingId: "p-302-en",
      shortCode: "OGN-302*",
      finish: "foil",
      language: "EN",
      isOvernumbered: true,
      isSigned: true,
    });
    const ogn253Zh = printing({
      printingId: "p-253-sc",
      shortCode: "OGN-253",
      finish: "foil",
      language: "SC",
      artVariant: "normal",
    });
    const ogn302Zh = printing({
      printingId: "p-302-sc-plain",
      shortCode: "OGN-302",
      finish: "foil",
      language: "SC",
      isOvernumbered: true,
    });
    const ognOverZh = printing({
      printingId: "p-302-sc-signed",
      shortCode: "OGN-302*",
      finish: "foil",
      language: "SC",
      artVariant: "normal",
      isSigned: true,
    });
    const result = computeProductSuggestions(
      group(
        [ognOverEn, ogn253Zh, ogn302Zh, ognOverZh],
        {
          cardtrader: {
            staged: [
              staged({
                externalId: 345_503,
                productName: "Darius - Hand of Noxus",
                finish: "foil",
                language: "SC",
                marketCents: null,
                lowCents: 45_064,
              }),
            ],
            assignments: [
              {
                externalId: 345_503,
                printingId: "p-302-en",
                finish: "foil",
                language: "EN",
              },
            ],
          },
        },
        "Hand of Noxus",
      ),
    );
    expect(
      result.get(productSuggestionKey("cardtrader", 345_503, "foil", "SC"))?.[0]?.printingId,
    ).toBe("p-302-sc-signed");
  });

  it("uses price alone to prefer the signed printing over an otherwise tied unsigned sibling", () => {
    const normalUnsigned = printing({
      printingId: "p-normal-unsigned",
      shortCode: "OGN-100",
      finish: "foil",
      language: "SC",
      artVariant: "normal",
      isSigned: false,
    });
    const normalSigned = printing({
      printingId: "p-normal-signed",
      shortCode: "OGN-100*",
      finish: "foil",
      language: "SC",
      artVariant: "normal",
      isSigned: true,
    });
    const result = computeProductSuggestions(
      group([normalUnsigned, normalSigned], {
        cardtrader: {
          staged: [
            staged({
              externalId: 111,
              productName: "Ahri",
              finish: "foil",
              language: "SC",
              marketCents: null,
              lowCents: 45_000,
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 111, "foil", "SC"))?.[0]?.printingId).toBe(
      "p-normal-signed",
    );
  });

  it("does not apply the price signal below the premium threshold", () => {
    const unsigned = printing({
      printingId: "p-unsigned",
      shortCode: "OGN-100",
      finish: "foil",
      language: "SC",
      isSigned: false,
    });
    const signed = printing({
      printingId: "p-signed",
      shortCode: "OGN-100*",
      finish: "foil",
      language: "SC",
      isSigned: true,
    });
    const result = computeProductSuggestions(
      group([unsigned, signed], {
        cardtrader: {
          staged: [
            staged({
              externalId: 222,
              productName: "Ahri",
              finish: "foil",
              language: "SC",
              marketCents: null,
              lowCents: 500,
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 222, "foil", "SC"))).toBeUndefined();
  });

  it("does not propagate cross-language evidence across marketplaces", () => {
    const ognA = printing({ printingId: "p-a", shortCode: "OGN-100", finish: "foil" });
    const ognB = printing({ printingId: "p-b", shortCode: "OGN-200", finish: "foil" });
    const result = computeProductSuggestions(
      group([ognA, ognB], {
        tcgplayer: {
          staged: [
            staged({ externalId: 333, productName: "Ahri", finish: "foil", language: "EN" }),
          ],
          assignments: [],
        },
        cardtrader: {
          staged: [],
          assignments: [{ externalId: 333, printingId: "p-a", finish: "foil", language: "EN" }],
        },
      }),
    );
    expect(result.get(productSuggestionKey("tcgplayer", 333, "foil", "EN"))).toBeUndefined();
  });

  it("prefers a promo printing over a basic one when the group is tagged 'special'", () => {
    const regular = printing({ printingId: "p-regular", markerSlugs: [] });
    const promo = printing({ printingId: "p-promo", markerSlugs: ["launch-exclusive"] });
    const result = computeProductSuggestions(
      group([regular, promo], {
        tcgplayer: {
          staged: [
            staged({ externalId: 1000, productName: "Ahri", groupKind: "special" }),
            staged({ externalId: 1001, productName: "Ahri", groupKind: "basic" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 1000, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-promo");
    expect(
      result.get(productSuggestionKey("tcgplayer", 1001, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-regular");
  });

  it("disambiguates a basic-named product away from a promo printing when group is 'basic'", () => {
    const promo = printing({ printingId: "p-promo", markerSlugs: ["promo"] });
    const result = computeProductSuggestions(
      group([promo], {
        tcgplayer: {
          staged: [staged({ externalId: 1100, productName: "Ahri", groupKind: "basic" })],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("tcgplayer", 1100, "normal", "EN"))).toBeUndefined();
  });

  it("resolves CT normal vs altart per language using price-rank (Miss Fortune scenario)", () => {
    const normalEn = printing({ printingId: "p-n-en", language: "EN", finish: "foil" });
    const altEn = printing({
      printingId: "p-a-en",
      language: "EN",
      finish: "foil",
      shortCode: "OGN-001a",
      artVariant: "altart",
    });
    const normalZh = printing({ printingId: "p-n-sc", language: "SC", finish: "foil" });
    const altZh = printing({
      printingId: "p-a-sc",
      language: "SC",
      finish: "foil",
      shortCode: "OGN-001a",
      artVariant: "altart",
    });
    const result = computeProductSuggestions(
      group([normalEn, altEn, normalZh, altZh], {
        cardtrader: {
          staged: [
            staged({
              externalId: 345_385,
              productName: "Miss Fortune - Buccaneer",
              finish: "foil",
              language: "EN",
              lowCents: 19,
              groupKind: "basic",
            }),
            staged({
              externalId: 345_385,
              productName: "Miss Fortune - Buccaneer",
              finish: "foil",
              language: "SC",
              lowCents: 23,
              groupKind: "basic",
            }),
            staged({
              externalId: 345_386,
              productName: "Miss Fortune - Buccaneer",
              finish: "foil",
              language: "EN",
              lowCents: 308,
              groupKind: "basic",
            }),
            staged({
              externalId: 345_386,
              productName: "Miss Fortune - Buccaneer",
              finish: "foil",
              language: "SC",
              lowCents: 259,
              groupKind: "basic",
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("cardtrader", 345_385, "foil", "EN"))?.[0]?.printingId,
    ).toBe("p-n-en");
    expect(
      result.get(productSuggestionKey("cardtrader", 345_385, "foil", "SC"))?.[0]?.printingId,
    ).toBe("p-n-sc");
    expect(
      result.get(productSuggestionKey("cardtrader", 345_386, "foil", "EN"))?.[0]?.printingId,
    ).toBe("p-a-en");
    expect(
      result.get(productSuggestionKey("cardtrader", 345_386, "foil", "SC"))?.[0]?.printingId,
    ).toBe("p-a-sc");
  });

  it("preserves price-rank after one product in the pair has been assigned", () => {
    const normalEn = printing({ printingId: "p-normal", artVariant: "normal" });
    const normalZh = printing({ printingId: "p-normal-sc", artVariant: "normal", language: "SC" });
    const altEn = printing({
      printingId: "p-alt-en",
      shortCode: "OGN-001a",
      artVariant: "altart",
    });
    const altZh = printing({
      printingId: "p-alt-sc",
      shortCode: "OGN-001a",
      artVariant: "altart",
      language: "SC",
    });
    const result = computeProductSuggestions(
      group([normalEn, normalZh, altEn, altZh], {
        cardmarket: {
          staged: [
            staged({
              externalId: 1301,
              productName: "Ahri",
              finish: "normal",
              language: null,
              lowCents: 500,
              groupKind: "basic",
            }),
          ],
          assigned: [
            staged({
              externalId: 1300,
              productName: "Ahri",
              finish: "normal",
              language: null,
              lowCents: 20,
              groupKind: "basic",
            }),
          ],
          assignments: [
            { externalId: 1300, printingId: "p-normal", finish: "normal", language: null },
          ],
        },
      }),
    );
    const suggested = result
      .get(productSuggestionKey("cardmarket", 1301, "normal", null))
      ?.map((s) => s.printingId)
      .toSorted();
    expect(suggested).toEqual(["p-alt-en", "p-alt-sc"]);
  });

  it("uses price to pair a normal/altart product split across two same-name products", () => {
    const normal = printing({ printingId: "p-normal", artVariant: "normal" });
    const alt = printing({ printingId: "p-alt", shortCode: "OGN-001a", artVariant: "altart" });
    const result = computeProductSuggestions(
      group([normal, alt], {
        tcgplayer: {
          staged: [
            staged({
              externalId: 1200,
              productName: "Ahri",
              finish: "normal",
              lowCents: 20,
              marketCents: 49,
              groupKind: "basic",
            }),
            staged({
              externalId: 1201,
              productName: "Ahri",
              finish: "normal",
              lowCents: 496,
              marketCents: 653,
              groupKind: "basic",
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 1200, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-normal");
    expect(
      result.get(productSuggestionKey("tcgplayer", 1201, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-alt");
  });

  it("disqualifies printings whose set doesn't match the product's group setSlug", () => {
    const sfdPrinting = printing({ printingId: "p-sfd", setId: "sfd", shortCode: "SFD-001" });
    const result = computeProductSuggestions(
      group([sfdPrinting], {
        tcgplayer: {
          staged: [
            staged({
              externalId: 1300,
              productName: "Ahri",
              finish: "normal",
              groupSetSlug: "ogn",
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("still suggests printings whose set matches the product's group setSlug", () => {
    const ognPrinting = printing({ printingId: "p-ogn", setId: "ogn" });
    const result = computeProductSuggestions(
      group([ognPrinting], {
        tcgplayer: {
          staged: [
            staged({
              externalId: 1310,
              productName: "Ahri",
              finish: "normal",
              groupSetSlug: "ogn",
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 1310, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-ogn");
  });

  it("ignores the set filter when the group's setSlug is null (no scoping)", () => {
    const sfdPrinting = printing({ printingId: "p-sfd", setId: "sfd" });
    const result = computeProductSuggestions(
      group([sfdPrinting], {
        tcgplayer: {
          staged: [
            staged({
              externalId: 1320,
              productName: "Ahri",
              finish: "normal",
              groupSetSlug: null,
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(
      result.get(productSuggestionKey("tcgplayer", 1320, "normal", "EN"))?.[0]?.printingId,
    ).toBe("p-sfd");
  });

  it("skips the sibling fan-out when the tied printings aren't actually siblings", () => {
    const enSfd = printing({ printingId: "p-sfd-en", shortCode: "SFD-001", language: "EN" });
    const scSfd = printing({ printingId: "p-sfd-sc", shortCode: "SFD-001", language: "SC" });
    const scOgn = printing({ printingId: "p-ogn-sc", shortCode: "OGN-042", language: "SC" });
    const result = computeProductSuggestions(
      group([enSfd, scSfd, scOgn], {
        cardmarket: {
          staged: [
            staged({ externalId: 123, productName: "Ahri", finish: "normal", language: null }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 123, "normal", null))).toBeUndefined();
  });

  it("emits a weak (amber) suggestion when a CM SKU has no matching printing finish but a sibling SKU is assigned", () => {
    const foil = printing({ printingId: "p-foil", finish: "foil" });
    const result = computeProductSuggestions(
      group([foil], {
        cardmarket: {
          staged: [staged({ externalId: 555, productName: "Ahri", finish: "normal" })],
          assigned: [staged({ externalId: 555, productName: "Ahri", finish: "foil" })],
          assignments: [{ externalId: 555, printingId: "p-foil", finish: "foil", language: null }],
        },
      }),
    );
    const weak = result.get(productSuggestionKey("cardmarket", 555, "normal", "EN"));
    expect(weak).toEqual([{ printingId: "p-foil", score: 50, isWeak: true }]);
  });

  it("does not emit a weak suggestion when no sibling SKU is yet assigned", () => {
    const foil = printing({ printingId: "p-foil", finish: "foil" });
    const result = computeProductSuggestions(
      group([foil], {
        cardmarket: {
          staged: [
            staged({ externalId: 556, productName: "Ahri", finish: "normal" }),
            staged({ externalId: 556, productName: "Ahri", finish: "foil" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 556, "normal", "EN"))).toBeUndefined();
  });

  it("does not emit a weak suggestion when only a different-externalId sibling is assigned", () => {
    const foil = printing({ printingId: "p-foil", finish: "foil" });
    const result = computeProductSuggestions(
      group([foil], {
        cardmarket: {
          staged: [staged({ externalId: 557, productName: "Ahri", finish: "normal" })],
          assignments: [{ externalId: 999, printingId: "p-foil", finish: "foil", language: null }],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 557, "normal", "EN"))).toBeUndefined();
  });

  it("mirrors every sibling printing when one externalId fans out to multiple printings", () => {
    const enFoil = printing({ printingId: "p-en-foil", finish: "foil", language: "EN" });
    const scFoil = printing({
      printingId: "p-sc-foil",
      finish: "foil",
      language: "SC",
      shortCode: "OGN-001",
    });
    const result = computeProductSuggestions(
      group([enFoil, scFoil], {
        cardmarket: {
          staged: [
            staged({ externalId: 558, productName: "Ahri", finish: "normal", language: null }),
          ],
          assigned: [
            staged({ externalId: 558, productName: "Ahri", finish: "foil", language: null }),
          ],
          assignments: [
            { externalId: 558, printingId: "p-en-foil", finish: "foil", language: null },
            { externalId: 558, printingId: "p-sc-foil", finish: "foil", language: null },
          ],
        },
      }),
    );
    const weak = result.get(productSuggestionKey("cardmarket", 558, "normal", null));
    expect(weak?.map((s) => s.printingId).toSorted()).toEqual(["p-en-foil", "p-sc-foil"]);
    expect(weak?.every((s) => s.isWeak === true)).toBe(true);
  });

  it("drops the SC printing from a TCG weak suggestion even when a legacy SC binding exists", () => {
    const enFoil = printing({ printingId: "p-en-foil", finish: "foil", language: "EN" });
    const scFoil = printing({
      printingId: "p-sc-foil",
      finish: "foil",
      language: "SC",
      shortCode: "OGN-001",
    });
    const result = computeProductSuggestions(
      group([enFoil, scFoil], {
        tcgplayer: {
          staged: [
            staged({ externalId: 558, productName: "Ahri", finish: "normal", language: null }),
          ],
          assigned: [
            staged({ externalId: 558, productName: "Ahri", finish: "foil", language: null }),
          ],
          assignments: [
            { externalId: 558, printingId: "p-en-foil", finish: "foil", language: null },
            { externalId: 558, printingId: "p-sc-foil", finish: "foil", language: null },
          ],
        },
      }),
    );
    const weak = result.get(productSuggestionKey("tcgplayer", 558, "normal", null));
    expect(weak?.map((s) => s.printingId)).toEqual(["p-en-foil"]);
  });

  it("prefers a strong suggestion over a weak one when the printing finish does match", () => {
    const normal = printing({ printingId: "p-normal", finish: "normal" });
    const result = computeProductSuggestions(
      group([normal], {
        cardmarket: {
          staged: [staged({ externalId: 559, productName: "Ahri", finish: "normal" })],
          assignments: [],
        },
      }),
    );
    const entry = result.get(productSuggestionKey("cardmarket", 559, "normal", "EN"));
    expect(entry?.[0]?.isWeak).toBeUndefined();
    expect(entry?.[0]?.score).toBeGreaterThanOrEqual(100);
  });

  it("does not emit a weak suggestion on CardTrader (per-language SKUs handle this differently)", () => {
    const foil = printing({ printingId: "p-foil", finish: "foil", language: "EN" });
    const result = computeProductSuggestions(
      group([foil], {
        cardtrader: {
          staged: [
            staged({ externalId: 560, productName: "Ahri", finish: "normal", language: "EN" }),
          ],
          assignments: [{ externalId: 560, printingId: "p-foil", finish: "foil", language: "EN" }],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 560, "normal", "EN"))).toBeUndefined();
  });
});
