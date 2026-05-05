import { describe, expect, it } from "vitest";

import {
  collectEntries,
  collectStrongMappings,
  displayedProductLanguage,
  isCardNameMismatch,
} from "./marketplace-products-table";
import type {
  MarketplaceAssignment,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import type { ProductSuggestion } from "./suggest-mapping";
import { productSuggestionKey } from "./suggest-mapping";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-en",
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
    productName: "Product",
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
      assigned: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
    cardmarket: {
      staged: StagedProduct[];
      assigned: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
    cardtrader: {
      staged: StagedProduct[];
      assigned: StagedProduct[];
      assignments: MarketplaceAssignment[];
    };
  }> = {},
): UnifiedMappingGroup {
  const empty = { staged: [], assigned: [], assignments: [] };
  const tcg = { ...empty, ...perMarketplace.tcgplayer };
  const cm = { ...empty, ...perMarketplace.cardmarket };
  const ct = { ...empty, ...perMarketplace.cardtrader };
  return {
    cardId: "c-1",
    cardSlug: "fireball",
    cardName: "Fireball",
    cardType: "spell",
    superTypes: [],
    domains: ["fury"],
    energy: 1,
    might: null,
    setId: "set-1",
    setName: "Set",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: {
      stagedProducts: tcg.staged,
      assignedProducts: tcg.assigned,
      assignments: tcg.assignments,
    },
    cardmarket: {
      stagedProducts: cm.staged,
      assignedProducts: cm.assigned,
      assignments: cm.assignments,
    },
    cardtrader: {
      stagedProducts: ct.staged,
      assignedProducts: ct.assigned,
      assignments: ct.assignments,
    },
  };
}

describe("collectEntries", () => {
  it("returns no entries when all marketplace buckets are empty", () => {
    const entries = collectEntries(group([printing()]));
    expect(entries).toEqual([]);
  });

  it("marks a product as assigned when assignedProducts contains its (externalId, finish, language) tuple", () => {
    const product = staged({ externalId: 1, finish: "normal", language: "EN" });
    const entries = collectEntries(
      group([printing({ printingId: "p-1" })], {
        cardtrader: {
          staged: [],
          assigned: [product],
          assignments: [{ externalId: 1, printingId: "p-1", finish: "normal", language: "EN" }],
        },
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].isAssigned).toBe(true);
    expect([...entries[0].assignedPrintingIds]).toEqual(["p-1"]);
    expect(entries[0].assignedPrintings[0]).toMatchObject({
      printingId: "p-1",
      shortCode: "OGN-001",
      finish: "normal",
      language: "EN",
    });
  });

  it("does not cross-contaminate assigned printings across language variants for per-language marketplaces", () => {
    // CT product EN and ZH both have the same externalId in staging. Only the
    // ZH variant is assigned to a printing. The EN row must not show the ZH
    // printing under "Assigned printings".
    const enPrint = printing({ printingId: "p-en", language: "EN" });
    const zhPrint = printing({ printingId: "p-zh", language: "ZH" });
    const entries = collectEntries(
      group([enPrint, zhPrint], {
        cardtrader: {
          staged: [staged({ externalId: 42, language: "EN" })],
          assigned: [staged({ externalId: 42, language: "ZH" })],
          assignments: [{ externalId: 42, printingId: "p-zh", finish: "normal", language: "ZH" }],
        },
      }),
    );
    const enEntry = entries.find((e) => e.product.language === "EN");
    const zhEntry = entries.find((e) => e.product.language === "ZH");
    expect(enEntry?.isAssigned).toBe(false);
    expect(enEntry?.assignedPrintings).toEqual([]);
    expect(zhEntry?.isAssigned).toBe(true);
    expect(zhEntry?.assignedPrintings.map((p) => p.printingId)).toEqual(["p-zh"]);
  });

  it("treats a null assignment language as matching every row language (Cardmarket aggregate)", () => {
    const enPrint = printing({ printingId: "p-en", language: "EN" });
    const zhPrint = printing({ printingId: "p-zh", language: "ZH" });
    const entries = collectEntries(
      group([enPrint, zhPrint], {
        cardmarket: {
          staged: [],
          assigned: [
            staged({ externalId: 99, language: "EN" }),
            staged({ externalId: 99, language: "ZH" }),
          ],
          assignments: [
            // One Cardmarket assignment fans out across languages via null.
            { externalId: 99, printingId: "p-en", finish: "normal", language: null },
          ],
        },
      }),
    );
    // Both language variants see the same printing (language fan-out).
    const enEntry = entries.find((e) => e.product.language === "EN");
    const zhEntry = entries.find((e) => e.product.language === "ZH");
    expect(enEntry?.assignedPrintings.map((p) => p.printingId)).toEqual(["p-en"]);
    expect(zhEntry?.assignedPrintings.map((p) => p.printingId)).toEqual(["p-en"]);
  });

  it("lists every printing a multi-variant assignment covers", () => {
    // Two products for the same printing in the same marketplace — both should
    // surface with their own row AND resolve to the same printing in the
    // Assigned printings column.
    const shared = printing({ printingId: "p-1", language: "EN" });
    const entries = collectEntries(
      group([shared], {
        cardmarket: {
          staged: [],
          assigned: [
            staged({ externalId: 100, language: "EN" }),
            staged({ externalId: 200, language: "EN" }),
          ],
          assignments: [
            { externalId: 100, printingId: "p-1", finish: "normal", language: null },
            { externalId: 200, printingId: "p-1", finish: "normal", language: null },
          ],
        },
      }),
    );
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.assignedPrintings.map((p) => p.printingId)).toEqual(["p-1"]);
    }
  });

  it("dedupes rows that appear in both stagedProducts and assignedProducts", () => {
    const product = staged({ externalId: 5, finish: "normal", language: "EN" });
    const entries = collectEntries(
      group([printing()], {
        tcgplayer: {
          staged: [product],
          assigned: [product],
          assignments: [],
        },
      }),
    );
    expect(entries).toHaveLength(1);
  });

  it("sorts entries by marketplace then product name then reverse finish", () => {
    const entries = collectEntries(
      group([printing()], {
        tcgplayer: {
          staged: [
            staged({ externalId: 1, productName: "Zeta", finish: "normal" }),
            staged({ externalId: 2, productName: "Alpha", finish: "normal" }),
          ],
          assigned: [],
          assignments: [],
        },
        cardmarket: {
          staged: [staged({ externalId: 3, productName: "Alpha", finish: "normal" })],
          assigned: [],
          assignments: [],
        },
      }),
    );
    expect(entries.map((e) => `${e.marketplace}:${e.product.productName}`)).toEqual([
      "cardmarket:Alpha",
      "tcgplayer:Alpha",
      "tcgplayer:Zeta",
    ]);
  });

  it("hides the Cardmarket placeholder language so non-EN products don't falsely render as EN", () => {
    // Regression: CM 873230 is a ZH-only product on Cardmarket, but our
    // staging layer stamps every CM row as "EN" (CM's price guide is
    // language-aggregate — it doesn't expose per-product language). The UI
    // must not surface that placeholder, otherwise ZH cards appear as EN.
    expect(displayedProductLanguage("cardmarket", "EN")).toBeNull();
    expect(displayedProductLanguage("cardmarket", "ZH")).toBeNull();
    // TCG/CT keep their stored language — CT is per-language, TCG is
    // effectively English-only for Riftbound so "EN" is meaningful there.
    expect(displayedProductLanguage("tcgplayer", "EN")).toBe("EN");
    expect(displayedProductLanguage("cardtrader", "ZH")).toBe("ZH");
    expect(displayedProductLanguage("cardtrader", "")).toBeNull();
  });

  it("populates otherAssignedPrintingIds with printings assigned to a different external ID in the same marketplace", () => {
    // Two CT products, each with its own assignment. From product 1's view,
    // the printing assigned to product 2 shows up in otherAssignedPrintingIds
    // so the Assign dropdown can dim it as a conflict hint.
    const pNormal = printing({ printingId: "p-normal", finish: "normal" });
    const pFoil = printing({ printingId: "p-foil", finish: "foil" });
    const entries = collectEntries(
      group([pNormal, pFoil], {
        cardtrader: {
          staged: [],
          assigned: [
            staged({ externalId: 1, finish: "normal" }),
            staged({ externalId: 2, finish: "foil" }),
          ],
          assignments: [
            { externalId: 1, printingId: "p-normal", finish: "normal", language: "EN" },
            { externalId: 2, printingId: "p-foil", finish: "foil", language: "EN" },
          ],
        },
      }),
    );
    const one = entries.find((e) => e.product.externalId === 1);
    const two = entries.find((e) => e.product.externalId === 2);
    expect([...(one?.otherAssignedPrintingIds ?? [])]).toEqual(["p-foil"]);
    expect([...(two?.otherAssignedPrintingIds ?? [])]).toEqual(["p-normal"]);
    // Own assignment does not appear in otherAssignedPrintingIds.
    expect(one?.otherAssignedPrintingIds.has("p-normal")).toBe(false);
    expect(two?.otherAssignedPrintingIds.has("p-foil")).toBe(false);
  });

  it("skips assignment entries whose printingId is not in group.printings", () => {
    // Defensive — should never happen after the merge fix, but if a stale
    // assignment sneaks through we shouldn't crash or produce undefined rows.
    const entries = collectEntries(
      group([printing({ printingId: "p-known" })], {
        cardtrader: {
          staged: [],
          assigned: [staged({ externalId: 9 })],
          assignments: [
            { externalId: 9, printingId: "p-missing", finish: "normal", language: "EN" },
          ],
        },
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].assignedPrintings).toEqual([]);
  });
});

describe("collectStrongMappings", () => {
  it("returns empty arrays for every marketplace when no suggestions are provided", () => {
    const result = collectStrongMappings(group([printing()]), undefined);
    expect(result).toEqual({ tcgplayer: [], cardmarket: [], cardtrader: [] });
  });

  it("filters out suggestions whose score is below the strong-match threshold", () => {
    const g = group([printing({ printingId: "p-1" })], {
      tcgplayer: { staged: [staged({ externalId: 1 })], assigned: [], assignments: [] },
    });
    const suggestions = new Map<string, ProductSuggestion[]>([
      [productSuggestionKey("tcgplayer", 1, "normal", "EN"), [{ printingId: "p-1", score: 100 }]],
    ]);
    expect(collectStrongMappings(g, suggestions).tcgplayer).toEqual([]);
  });

  it("includes strong suggestions for unassigned products", () => {
    const g = group([printing({ printingId: "p-1" })], {
      tcgplayer: { staged: [staged({ externalId: 1 })], assigned: [], assignments: [] },
    });
    const suggestions = new Map<string, ProductSuggestion[]>([
      [productSuggestionKey("tcgplayer", 1, "normal", "EN"), [{ printingId: "p-1", score: 200 }]],
    ]);
    expect(collectStrongMappings(g, suggestions).tcgplayer).toEqual([
      { externalId: 1, finish: "normal", language: "EN", printingId: "p-1" },
    ]);
  });

  it("skips products that are already assigned", () => {
    // The suggestion chip for an assigned product is hidden anyway (see
    // MarketplaceProductRow — suggestions render only when !isAssigned), so
    // the batch helper must skip them too or it would re-submit stale pairs.
    const product = staged({ externalId: 1 });
    const g = group([printing({ printingId: "p-1" })], {
      cardtrader: {
        staged: [],
        assigned: [product],
        assignments: [{ externalId: 1, printingId: "p-1", finish: "normal", language: "EN" }],
      },
    });
    const suggestions = new Map<string, ProductSuggestion[]>([
      [productSuggestionKey("cardtrader", 1, "normal", "EN"), [{ printingId: "p-1", score: 200 }]],
    ]);
    expect(collectStrongMappings(g, suggestions).cardtrader).toEqual([]);
  });

  it("emits every sibling printing for one language-aggregate product", () => {
    // Cardmarket's price guide is language-aggregate, so a single CM product
    // can legitimately suggest multiple sibling printings (EN and ZH). Batch
    // accept must fire one mapping per sibling — not just the top scorer —
    // otherwise the aggregate price only attaches to one language variant.
    const en = printing({ printingId: "p-en", language: "EN" });
    const zh = printing({ printingId: "p-zh", language: "ZH" });
    const g = group([en, zh], {
      cardmarket: {
        staged: [staged({ externalId: 99, language: null })],
        assigned: [],
        assignments: [],
      },
    });
    const suggestions = new Map<string, ProductSuggestion[]>([
      [
        productSuggestionKey("cardmarket", 99, "normal", null),
        [
          { printingId: "p-en", score: 150 },
          { printingId: "p-zh", score: 150 },
        ],
      ],
    ]);
    const result = collectStrongMappings(g, suggestions);
    expect(result.cardmarket).toHaveLength(2);
    expect(result.cardmarket.map((m) => m.printingId).toSorted()).toEqual(["p-en", "p-zh"]);
    expect(result.cardmarket.every((m) => m.language === null)).toBe(true);
  });

  it("segregates mappings by marketplace so one bucket can't leak into another", () => {
    const g = group([printing({ printingId: "p-1" })], {
      tcgplayer: { staged: [staged({ externalId: 1 })], assigned: [], assignments: [] },
      cardmarket: {
        staged: [staged({ externalId: 2, language: null })],
        assigned: [],
        assignments: [],
      },
    });
    const suggestions = new Map<string, ProductSuggestion[]>([
      [productSuggestionKey("tcgplayer", 1, "normal", "EN"), [{ printingId: "p-1", score: 200 }]],
      [productSuggestionKey("cardmarket", 2, "normal", null), [{ printingId: "p-1", score: 200 }]],
    ]);
    const result = collectStrongMappings(g, suggestions);
    expect(result.tcgplayer).toHaveLength(1);
    expect(result.cardmarket).toHaveLength(1);
    expect(result.cardtrader).toEqual([]);
  });
});

describe("isCardNameMismatch", () => {
  it("returns false only when the normalized names are exactly equal", () => {
    // "Kai'Sa, Survivor" vs "KaiSa Survivor" — same card, different surface
    // form — punctuation, spacing, and casing normalize away.
    expect(isCardNameMismatch("Kai'Sa, Survivor", "KaiSa Survivor")).toBe(false);
    expect(isCardNameMismatch("BLAST CONE", "Blast Cone")).toBe(false);
    expect(isCardNameMismatch("Mega-Mech", "Mega Mech")).toBe(false);
  });

  it("returns true when the product name has any extra suffix beyond the card name", () => {
    // Substring containment is not enough — suffixes like "(Foil)" or variant
    // markers must trigger the yellow highlight so the admin notices them.
    expect(isCardNameMismatch("Blast Cone (Foil)", "Blast Cone")).toBe(true);
    expect(isCardNameMismatch("Jinx Loose Cannon Signature", "Loose Cannon")).toBe(true);
    expect(isCardNameMismatch("Kai'Sa, Survivor - Alt Art", "KaiSa Survivor")).toBe(true);
    expect(isCardNameMismatch("Mega-Mech Foil", "Mega Mech")).toBe(true);
  });

  it("returns true when the product name does not contain the card name at all", () => {
    expect(isCardNameMismatch("Champion Cantrip", "Blast Cone")).toBe(true);
    expect(isCardNameMismatch("Random Token", "Fireball")).toBe(true);
  });

  it("returns false when the card name is empty (can't meaningfully match)", () => {
    expect(isCardNameMismatch("Some Product", "")).toBe(false);
  });
});
