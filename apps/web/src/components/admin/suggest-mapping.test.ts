import { describe, expect, it } from "vitest";

import type {
  MarketplaceAssignment,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import {
  computeProductSuggestions,
  productSuggestionKey,
  STRONG_MATCH_THRESHOLD,
} from "./suggest-mapping";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-normal",
    shortCode: "OGN-001",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: [],
    finish: "normal",
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
    tcgplayer: { staged: StagedProduct[]; assignments: MarketplaceAssignment[] };
    cardmarket: { staged: StagedProduct[]; assignments: MarketplaceAssignment[] };
    cardtrader: { staged: StagedProduct[]; assignments: MarketplaceAssignment[] };
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
    cardType: "Unit",
    superTypes: [],
    domains: ["Fury"],
    energy: 2,
    might: 3,
    setId: "set-1",
    setName: "Origins",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: {
      stagedProducts: tcg.staged,
      assignedProducts: [],
      assignments: tcg.assignments,
    },
    cardmarket: {
      stagedProducts: cm.staged,
      assignedProducts: [],
      assignments: cm.assignments,
    },
    cardtrader: {
      stagedProducts: ct.staged,
      assignedProducts: [],
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
    expect(result.get(key)?.printingId).toBe("p-normal");
  });

  it("suggests alt-art printing for a product whose suffix is Alternate Art", () => {
    const normal = printing({ printingId: "p-normal", artVariant: "normal" });
    const alt = printing({ printingId: "p-alt", shortCode: "OGN-001a", artVariant: "altart" });
    const result = computeProductSuggestions(
      group([normal, alt], {
        cardmarket: {
          staged: [
            staged({ externalId: 201, productName: "Ahri", finish: "normal" }),
            staged({ externalId: 202, productName: "Ahri Alternate Art", finish: "normal" }),
          ],
          assignments: [],
        },
      }),
    );
    const altKey = productSuggestionKey("cardmarket", 202, "normal", "EN");
    const normalKey = productSuggestionKey("cardmarket", 201, "normal", "EN");
    expect(result.get(altKey)?.printingId).toBe("p-alt");
    expect(result.get(normalKey)?.printingId).toBe("p-normal");
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
    expect(result.get(productSuggestionKey("tcgplayer", 500, "normal", "EN"))?.printingId).toBe(
      "p-normal",
    );
    expect(result.get(productSuggestionKey("cardmarket", 500, "normal", "EN"))?.printingId).toBe(
      "p-normal",
    );
  });

  it("does not suggest a CardTrader product across a language mismatch", () => {
    // Regression: a ZH CT product should never be proposed for an EN printing,
    // even when the EN printing is the only unmapped printing with matching
    // finish — the server rejects such mappings with a "variant mismatch".
    const enPrinting = printing({ printingId: "p-en", language: "EN", finish: "foil" });
    const result = computeProductSuggestions(
      group([enPrinting], {
        cardtrader: {
          staged: [
            staged({ externalId: 379_529, productName: "Ahri", finish: "foil", language: "ZH" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.size).toBe(0);
  });

  it("still suggests CardTrader products whose language matches the printing", () => {
    const zhPrinting = printing({ printingId: "p-zh", language: "ZH", finish: "foil" });
    const result = computeProductSuggestions(
      group([zhPrinting], {
        cardtrader: {
          staged: [
            staged({ externalId: 379_529, productName: "Ahri", finish: "foil", language: "ZH" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 379_529, "foil", "ZH"))?.printingId).toBe(
      "p-zh",
    );
  });

  it("still suggests TCG/CM products across languages (those staging pools are EN-only)", () => {
    // TCG/CM staging uses placeholder EN regardless of the physical printing
    // language; the language gate is CT-only. Gating TCG/CM would suppress
    // every legitimate non-EN-printing suggestion, since staging is never ZH.
    const zhPrinting = printing({ printingId: "p-zh", language: "ZH", finish: "foil" });
    const result = computeProductSuggestions(
      group([zhPrinting], {
        tcgplayer: {
          staged: [
            staged({ externalId: 888, productName: "Ahri", finish: "foil", language: "EN" }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("tcgplayer", 888, "foil", "EN"))?.printingId).toBe(
      "p-zh",
    );
  });

  it("produces strong-match scores for prefix + variant agreement", () => {
    const alt = printing({ printingId: "p-alt", artVariant: "altart", finish: "normal" });
    const result = computeProductSuggestions(
      group([alt], {
        tcgplayer: {
          staged: [staged({ externalId: 700, productName: "Ahri Alternate Art" })],
          assignments: [],
        },
      }),
    );
    const entry = result.get(productSuggestionKey("tcgplayer", 700, "normal", "EN"));
    expect(entry).toBeDefined();
    expect(entry!.score).toBeGreaterThanOrEqual(STRONG_MATCH_THRESHOLD);
  });

  it("suggests a metal printing for a foil-staging product whose name contains 'Metal'", () => {
    // Marketplaces only emit `normal` or `foil` in staging — "metal" never
    // appears there. A metal printing must accept foil staging to ever see a
    // price update.
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
    expect(entry?.printingId).toBe("p-metal");
  });

  it("routes the Metal-titled product to the metal printing and the plain foil to the regular foil", () => {
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
    expect(result.get(productSuggestionKey("tcgplayer", 900, "foil", "EN"))?.printingId).toBe(
      "p-foil",
    );
    expect(result.get(productSuggestionKey("tcgplayer", 901, "foil", "EN"))?.printingId).toBe(
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
    expect(result.get(productSuggestionKey("tcgplayer", 910, "foil", "EN"))?.printingId).toBe(
      "p-md",
    );
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
    // Regression: CM 872479 used to suggest one of three tied printings
    // (SFD-R02 EN, SFD-R02 ZH, OGN-042 ZH) based on iteration order — which
    // was non-deterministic since the unified printings query didn't tie-break
    // on language. With mutual-best-match, three printings competing for one
    // product means the product has no unique top → no suggestion at all.
    const enSfd = printing({ printingId: "p-sfd-en", language: "EN" });
    const zhSfd = printing({ printingId: "p-sfd-zh", language: "ZH" });
    const zhOgn = printing({ printingId: "p-ogn-zh", language: "ZH", shortCode: "OGN-042" });
    const result = computeProductSuggestions(
      group([enSfd, zhSfd, zhOgn], {
        cardmarket: {
          staged: [staged({ externalId: 872_479, productName: "Calm Rune", finish: "normal" })],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardmarket", 872_479, "normal", "EN"))).toBeUndefined();
  });

  it("still suggests when only one printing matches a Cardmarket product", () => {
    // The mutual-best gate must not over-suppress: when a single unmapped
    // printing is the unique top match, the suggestion still fires.
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
      result.get(productSuggestionKey("cardmarket", 872_479, "normal", "EN"))?.printingId,
    ).toBe("p-en");
  });
});
