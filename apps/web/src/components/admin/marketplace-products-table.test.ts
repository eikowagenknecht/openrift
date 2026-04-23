import { describe, expect, it } from "vitest";

import { collectEntries, displayedProductLanguage } from "./marketplace-products-table";
import type {
  MarketplaceAssignment,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-en",
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
    cardType: "Spell",
    superTypes: [],
    domains: ["Fury"],
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
    expect(entries[0].assignedPrintings[0].label).toBe("EN:OGN-001::normal");
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
