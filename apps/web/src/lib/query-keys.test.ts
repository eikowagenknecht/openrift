import { describe, expect, it } from "vitest";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

import { queryKeys } from "./query-keys";

const mockConfig: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  productUrl: (id: number) => `https://tcgplayer.com/product/${id}`,
};

// ---------------------------------------------------------------------------
// Top-level keys
// ---------------------------------------------------------------------------

describe("queryKeys", () => {
  it("catalog.all", () => {
    expect(queryKeys.catalog.all).toEqual(["catalog"]);
  });

  it("collections.all", () => {
    expect(queryKeys.collections.all).toEqual(["collections"]);
  });

  it("copies.all", () => {
    expect(queryKeys.copies.all).toEqual(["copies"]);
  });

  it("copies.byCollection returns tuple with id", () => {
    expect(queryKeys.copies.byCollection("abc")).toEqual(["copies", "abc"]);
  });

  it("ownedCount.all", () => {
    expect(queryKeys.ownedCount.all).toEqual(["ownedCount"]);
  });

  it("priceHistory.byPrinting returns tuple with printingId and range", () => {
    expect(queryKeys.priceHistory.byPrinting("p1", "30d")).toEqual(["priceHistory", "p1", "30d"]);
  });
});

// ---------------------------------------------------------------------------
// Admin keys
// ---------------------------------------------------------------------------

describe("queryKeys.admin", () => {
  it("me", () => {
    expect(queryKeys.admin.me).toEqual(["admin", "me"]);
  });

  it("sets", () => {
    expect(queryKeys.admin.sets).toEqual(["admin", "sets"]);
  });

  it("marketplaceGroups", () => {
    expect(queryKeys.admin.marketplaceGroups).toEqual(["admin", "marketplace-groups"]);
  });

  it("featureFlags", () => {
    expect(queryKeys.admin.featureFlags).toEqual(["admin", "feature-flags"]);
  });

  it("cronStatus", () => {
    expect(queryKeys.admin.cronStatus).toEqual(["admin", "cron-status"]);
  });

  it("rehostStatus", () => {
    expect(queryKeys.admin.rehostStatus).toEqual(["admin", "rehost-status"]);
  });

  it("ignoredProducts", () => {
    expect(queryKeys.admin.ignoredProducts).toEqual(["admin", "ignored-products"]);
  });
});

// ---------------------------------------------------------------------------
// Admin card sources
// ---------------------------------------------------------------------------

describe("queryKeys.admin.cards", () => {
  it("all", () => {
    expect(queryKeys.admin.cards.all).toEqual(["admin", "cards"]);
  });

  it("list", () => {
    expect(queryKeys.admin.cards.list).toEqual(["admin", "cards", "list"]);
  });

  it("detail", () => {
    expect(queryKeys.admin.cards.detail("id")).toEqual(["admin", "cards", "detail", "id"]);
  });

  it("unmatched", () => {
    expect(queryKeys.admin.cards.unmatched("name")).toEqual([
      "admin",
      "cards",
      "unmatched",
      "name",
    ]);
  });

  it("allCards", () => {
    expect(queryKeys.admin.cards.allCards).toEqual(["admin", "cards", "all-cards"]);
  });

  it("providerNames", () => {
    expect(queryKeys.admin.cards.providerNames).toEqual(["admin", "cards", "provider-names"]);
  });

  it("providerStats", () => {
    expect(queryKeys.admin.cards.providerStats).toEqual(["admin", "cards", "provider-stats"]);
  });
});

// ---------------------------------------------------------------------------
// Admin price mappings
// ---------------------------------------------------------------------------

describe("queryKeys.admin.priceMappings", () => {
  it("bySource returns tuple with config source", () => {
    expect(queryKeys.admin.priceMappings.bySource(mockConfig)).toEqual(["admin", "tcgplayer"]);
  });

  it("bySourceAndFilter returns tuple with source, mappings, and showAll flag", () => {
    expect(queryKeys.admin.priceMappings.bySourceAndFilter(mockConfig, true)).toEqual([
      "admin",
      "tcgplayer",
      "mappings",
      { all: true },
    ]);
  });

  it("bySourceAndFilter with showAll=false", () => {
    expect(queryKeys.admin.priceMappings.bySourceAndFilter(mockConfig, false)).toEqual([
      "admin",
      "tcgplayer",
      "mappings",
      { all: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Admin unified mappings
// ---------------------------------------------------------------------------

describe("queryKeys.admin.unifiedMappings", () => {
  it("all", () => {
    expect(queryKeys.admin.unifiedMappings.all).toEqual(["admin", "unified-mappings"]);
  });

  it("list", () => {
    expect(queryKeys.admin.unifiedMappings.list).toEqual(["admin", "unified-mappings", "list"]);
  });

  it("byCard", () => {
    expect(queryKeys.admin.unifiedMappings.byCard("c-1")).toEqual([
      "admin",
      "unified-mappings",
      "card",
      "c-1",
    ]);
  });
});
