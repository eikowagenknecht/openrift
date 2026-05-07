import { describe, expect, it } from "vitest";

import type {
  MarketplaceAssignment,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import { computeProductSuggestions, productSuggestionKey } from "./suggest-mapping";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-normal",
    setId: "ogn",
    shortCode: "OGN-001",
    rarity: "common",
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
    cardType: "unit",
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
    expect(
      result.get(productSuggestionKey("cardtrader", 379_529, "foil", "ZH"))?.[0]?.printingId,
    ).toBe("p-zh");
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
    expect(result.get(productSuggestionKey("tcgplayer", 888, "foil", "EN"))?.[0]?.printingId).toBe(
      "p-zh",
    );
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
    expect(entry?.[0]?.printingId).toBe("p-metal");
  });

  it("routes the Metal-titled product to the metal printing and leaves the plain foil ambiguous", () => {
    // The "Metal" keyword positively boosts the metal printing for product 901.
    // Product 900 ("Ahri" with no suffix) has no signal to prefer one foil class
    // over the other, so both printings tie and the mutual-best gate emits no
    // suggestion — preferred over guessing wrong.
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
      result
        .get(productSuggestionKey("cardmarket", 872_479, "normal", "EN"))
        ?.map((s) => s.printingId),
    ).toEqual(["p-en"]);
  });

  it("suggests every sibling printing for a language-aggregate CM product", () => {
    // Two printings identical except for language: one EN, one ZH. Cardmarket
    // (language-aggregate, stored with language=null) has a single SKU for
    // them. The suggester emits both as independent chips — admin clicks each
    // to materialise the mapping.
    const en = printing({ printingId: "p-en", language: "EN" });
    const zh = printing({ printingId: "p-zh", language: "ZH" });
    const result = computeProductSuggestions(
      group([en, zh], {
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
    expect(suggested).toEqual(["p-en", "p-zh"]);
  });

  it("breaks a CardTrader ZH tie using the short_code already bound to the EN SKU", () => {
    // Regression: CT 345503 ("Darius - Hand of Noxus", foil) has the EN SKU
    // bound to OGN-302* (signed). The ZH SKU used to have no suggestion
    // because three ZH foil printings exist (OGN-253 normal, OGN-302
    // overnumbered, OGN-302* normal+signed), the product name "Darius - Hand
    // of Noxus" carries no disambiguator, and OGN-253 + OGN-302* tied at the
    // same base score while differing on short_code (so the sibling fallback
    // didn't apply either). Cross-language transfer resolves it: the EN
    // assignment to OGN-302* is strong evidence that ZH should map the same.
    const ognOverEn = printing({
      printingId: "p-302-en",
      shortCode: "OGN-302*",
      finish: "foil",
      language: "EN",
      artVariant: "overnumbered",
      isSigned: true,
    });
    const ogn253Zh = printing({
      printingId: "p-253-zh",
      shortCode: "OGN-253",
      finish: "foil",
      language: "ZH",
      artVariant: "normal",
    });
    const ogn302Zh = printing({
      printingId: "p-302-zh-plain",
      shortCode: "OGN-302",
      finish: "foil",
      language: "ZH",
      artVariant: "overnumbered",
    });
    const ognOverZh = printing({
      printingId: "p-302-zh-signed",
      shortCode: "OGN-302*",
      finish: "foil",
      language: "ZH",
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
                language: "ZH",
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
      result.get(productSuggestionKey("cardtrader", 345_503, "foil", "ZH"))?.[0]?.printingId,
    ).toBe("p-302-zh-signed");
  });

  it("uses price alone to prefer the signed printing over an otherwise tied unsigned sibling", () => {
    // Cross-language transfer doesn't apply (no existing assignment). The
    // high product price (€450) is enough to tip the mutual-best match from
    // "ambiguous tie" to "prefer the signed printing".
    const normalUnsigned = printing({
      printingId: "p-normal-unsigned",
      shortCode: "OGN-100",
      finish: "foil",
      language: "ZH",
      artVariant: "normal",
      isSigned: false,
    });
    const normalSigned = printing({
      printingId: "p-normal-signed",
      shortCode: "OGN-100*",
      finish: "foil",
      language: "ZH",
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
              language: "ZH",
              marketCents: null,
              lowCents: 45_000,
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 111, "foil", "ZH"))?.[0]?.printingId).toBe(
      "p-normal-signed",
    );
  });

  it("does not apply the price signal below the premium threshold", () => {
    // Cheap foil product: signed vs unsigned remains a tie, no suggestion emitted.
    const unsigned = printing({
      printingId: "p-unsigned",
      shortCode: "OGN-100",
      finish: "foil",
      language: "ZH",
      isSigned: false,
    });
    const signed = printing({
      printingId: "p-signed",
      shortCode: "OGN-100*",
      finish: "foil",
      language: "ZH",
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
              language: "ZH",
              marketCents: null,
              lowCents: 500,
            }),
          ],
          assignments: [],
        },
      }),
    );
    expect(result.get(productSuggestionKey("cardtrader", 222, "foil", "ZH"))).toBeUndefined();
  });

  it("does not propagate cross-language evidence across marketplaces", () => {
    // A CardTrader assignment must not leak into TCG/CM scoring. The TCG
    // product with externalId 333 exists on its own and should score via
    // suffix inference only — the CT assignment to OGN-100 is irrelevant.
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
    // Both TCG printings still tie on name alone (no CT-derived tiebreak),
    // so the mutual-best gate suppresses the suggestion.
    expect(result.get(productSuggestionKey("tcgplayer", 333, "foil", "EN"))).toBeUndefined();
  });

  it("prefers a promo printing over a basic one when the group is tagged 'special'", () => {
    // Same card with two printings — one regular, one promo (has markers).
    // A staged product whose group is tagged `special` should point to the
    // promo printing, not the regular one.
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
    // Regression: a name-only match can't distinguish "Ahri" (basic) from
    // "Ahri" (promo) if there's no suffix. The group_kind tag is the
    // tiebreaker — a product in a `basic` group shouldn't point to a promo
    // printing even when it's the only one available.
    const promo = printing({ printingId: "p-promo", markerSlugs: ["promo"] });
    const result = computeProductSuggestions(
      group([promo], {
        tcgplayer: {
          staged: [staged({ externalId: 1100, productName: "Ahri", groupKind: "basic" })],
          assignments: [],
        },
      }),
    );
    // The -80 penalty drags the score below the 100 threshold → no suggestion.
    expect(result.get(productSuggestionKey("tcgplayer", 1100, "normal", "EN"))).toBeUndefined();
  });

  it("resolves CT normal vs altart per language using price-rank (Miss Fortune scenario)", () => {
    // Real scenario from Miss Fortune, Buccaneer: CardTrader has two products
    // ("Miss Fortune - Buccaneer") per language, one cheap (normal) and one
    // expensive (altart). Language is part of the SKU so EN and ZH are
    // separate products. Price-rank must bucket independently per language.
    const normalEn = printing({ printingId: "p-n-en", language: "EN", finish: "foil" });
    const altEn = printing({
      printingId: "p-a-en",
      language: "EN",
      finish: "foil",
      shortCode: "OGN-001a",
      artVariant: "altart",
    });
    const normalZh = printing({ printingId: "p-n-zh", language: "ZH", finish: "foil" });
    const altZh = printing({
      printingId: "p-a-zh",
      language: "ZH",
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
              language: "ZH",
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
              language: "ZH",
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
      result.get(productSuggestionKey("cardtrader", 345_385, "foil", "ZH"))?.[0]?.printingId,
    ).toBe("p-n-zh");
    expect(
      result.get(productSuggestionKey("cardtrader", 345_386, "foil", "EN"))?.[0]?.printingId,
    ).toBe("p-a-en");
    expect(
      result.get(productSuggestionKey("cardtrader", 345_386, "foil", "ZH"))?.[0]?.printingId,
    ).toBe("p-a-zh");
  });

  it("preserves price-rank after one product in the pair has been assigned", () => {
    // Regression: accepting a suggestion moves the product from `stagedProducts`
    // to `assignedProducts`. The price-rank bucket must still treat both as
    // context — otherwise the remaining staged sibling drops its rank hint,
    // ties against every available printing at the group-kind score, and gets
    // stripped by the mutual-best gate. Effectively: clicking one chip would
    // vaporise every other suggestion in the card.
    // Four printings: the normal-EN was consumed by the cheap product, and
    // the remaining three (normal-ZH + altart EN/ZH siblings) all score the
    // same without the price-rank boost — so the mutual-best gate relies on
    // the boost to pick altart for the remaining pricey product.
    const normalEn = printing({ printingId: "p-normal", artVariant: "normal" });
    const normalZh = printing({ printingId: "p-normal-zh", artVariant: "normal", language: "ZH" });
    const altEn = printing({
      printingId: "p-alt-en",
      shortCode: "OGN-001a",
      artVariant: "altart",
    });
    const altZh = printing({
      printingId: "p-alt-zh",
      shortCode: "OGN-001a",
      artVariant: "altart",
      language: "ZH",
    });
    const result = computeProductSuggestions(
      group([normalEn, normalZh, altEn, altZh], {
        tcgplayer: {
          // The "cheap" product (1300) has been accepted on p-normal and now
          // lives in assignedProducts — the "pricey" product (1301) still
          // needs to be resolved to the altart fan-out (EN + ZH siblings).
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
    // Language-aggregate CM-style product (language=null): altart siblings
    // fan out, so both printings should come back as suggestions keyed by
    // the same product.
    const suggested = result
      .get(productSuggestionKey("tcgplayer", 1301, "normal", null))
      ?.map((s) => s.printingId)
      .toSorted();
    expect(suggested).toEqual(["p-alt-en", "p-alt-zh"]);
  });

  it("uses price to pair a normal/altart product split across two same-name products", () => {
    // The two TCG products have identical names ("Ahri"), one cheap, one 20×
    // more expensive. The altart printing should win the expensive product and
    // the normal printing the cheap one — the price-rank within a (finish,
    // language, groupKind) bucket is the tiebreak when the marketplace doesn't
    // disclose the variant in the name.
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
    // When a marketplace group is pinned to set "ogn", products in that
    // group must only suggest printings with setId === "ogn". A printing
    // from set "sfd" gets a -1 score and never surfaces.
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
    // A marketplace group with no assigned set should keep the original
    // permissive behaviour — no cross-set disqualification.
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
    // A three-way tie with one printing on a different short_code isn't a
    // legitimate sibling group — fall back to the old "skip on ambiguity"
    // behaviour rather than proposing all three.
    const enSfd = printing({ printingId: "p-sfd-en", shortCode: "SFD-001", language: "EN" });
    const zhSfd = printing({ printingId: "p-sfd-zh", shortCode: "SFD-001", language: "ZH" });
    const zhOgn = printing({ printingId: "p-ogn-zh", shortCode: "OGN-042", language: "ZH" });
    const result = computeProductSuggestions(
      group([enSfd, zhSfd, zhOgn], {
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
    // Bogus Cardmarket "normal" SKU on a foil-only card: the legit foil SKU
    // (same externalId) is already mapped to the foil printing, so we mirror
    // that mapping for the bogus normal — derived from the user's prior
    // assignment, not a heuristic.
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
    // User explicitly chose: the amber hint must wait until the legit sibling
    // is mapped, so the suggestion derives from a real prior decision rather
    // than guessing at the only-printing-on-this-card.
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
    // Q1: bogus entries should only mirror siblings sharing the same CM ID.
    // A legit foil product with a different externalId is not a sibling and
    // must not feed the amber hint.
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
    // Cardmarket's language-aggregate SKUs can map to both EN and ZH foils
    // under one externalId. The bogus normal SKU should mirror all of them so
    // the resulting state matches the legit sibling's coverage.
    const enFoil = printing({ printingId: "p-en-foil", finish: "foil", language: "EN" });
    const zhFoil = printing({
      printingId: "p-zh-foil",
      finish: "foil",
      language: "ZH",
      shortCode: "OGN-001",
    });
    const result = computeProductSuggestions(
      group([enFoil, zhFoil], {
        cardmarket: {
          staged: [
            staged({ externalId: 558, productName: "Ahri", finish: "normal", language: null }),
          ],
          assigned: [
            staged({ externalId: 558, productName: "Ahri", finish: "foil", language: null }),
          ],
          assignments: [
            { externalId: 558, printingId: "p-en-foil", finish: "foil", language: null },
            { externalId: 558, printingId: "p-zh-foil", finish: "foil", language: null },
          ],
        },
      }),
    );
    const weak = result.get(productSuggestionKey("cardmarket", 558, "normal", null));
    expect(weak?.map((s) => s.printingId).toSorted()).toEqual(["p-en-foil", "p-zh-foil"]);
    expect(weak?.every((s) => s.isWeak === true)).toBe(true);
  });

  it("prefers a strong suggestion over a weak one when the printing finish does match", () => {
    // The weak path is restricted to SKUs whose finish matches no printing on
    // the card. When a real same-finish printing exists, the strong scorer
    // owns the suggestion and the amber path stays out of its way.
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
    // CT enforces language at the SKU level and has its own cross-language
    // evidence path; layering an amber sibling-mirror would conflict with
    // those guards and risk language-mismatched assignments.
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
