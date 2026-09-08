import { describe, expect, it } from "vitest";

import type { SourceMappingConfig } from "@/features/admin/lib/price-mappings-types";

import { adminKeys } from "./admin-query-keys";

const mockConfig: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  productUrl: (id: number) => `https://tcgplayer.com/product/${id}`,
};

describe("adminKeys", () => {
  it("me is keyed per user so identities never share a cache slot", () => {
    expect(adminKeys.me("user-1")).toEqual(["admin", "me", "user-1"]);
    expect(adminKeys.me(null)).toEqual(["admin", "me", null]);
    expect(adminKeys.me("user-1")).not.toEqual(adminKeys.me("user-2"));
  });

  it("sets", () => {
    expect(adminKeys.sets).toEqual(["admin", "sets"]);
  });

  it("marketplaceGroups", () => {
    expect(adminKeys.marketplaceGroups).toEqual(["admin", "marketplace-groups"]);
  });

  it("featureFlags", () => {
    expect(adminKeys.featureFlags).toEqual(["admin", "feature-flags"]);
  });

  it("jobSchedules", () => {
    expect(adminKeys.jobSchedules).toEqual(["admin", "job-schedules"]);
  });

  it("rehostStatus", () => {
    expect(adminKeys.rehostStatus).toEqual(["admin", "rehost-status"]);
  });

  it("ignoredProducts", () => {
    expect(adminKeys.ignoredProducts).toEqual(["admin", "ignored-products"]);
  });
});

describe("adminKeys.cards", () => {
  it("all", () => {
    expect(adminKeys.cards.all).toEqual(["admin", "cards"]);
  });

  it("list", () => {
    expect(adminKeys.cards.list).toEqual(["admin", "cards", "list"]);
  });

  it("detail", () => {
    expect(adminKeys.cards.detail("id")).toEqual(["admin", "cards", "detail", "id"]);
  });

  it("unmatched", () => {
    expect(adminKeys.cards.unmatched("name")).toEqual(["admin", "cards", "unmatched", "name"]);
  });

  it("allCards", () => {
    expect(adminKeys.cards.allCards).toEqual(["admin", "cards", "all-cards"]);
  });

  it("providerNames", () => {
    expect(adminKeys.cards.providerNames).toEqual(["admin", "cards", "provider-names"]);
  });

  it("providerStats", () => {
    expect(adminKeys.cards.providerStats).toEqual(["admin", "cards", "provider-stats"]);
  });
});

describe("adminKeys.printingDesk", () => {
  it("all is the prefix every desk read sits under", () => {
    expect(adminKeys.printingDesk.all).toEqual(["admin", "printing-desk"]);
  });

  it("list keys per mode", () => {
    expect(adminKeys.printingDesk.list("mine")).toEqual(["admin", "printing-desk", "list", "mine"]);
    expect(adminKeys.printingDesk.list("mine")).not.toEqual(adminKeys.printingDesk.list("all"));
  });

  it("cardPrintings keys per card slug", () => {
    expect(adminKeys.printingDesk.cardPrintings("annie")).toEqual([
      "admin",
      "printing-desk",
      "card",
      "annie",
    ]);
  });

  it("printing keys per id and exposes a prefix", () => {
    expect(adminKeys.printingDesk.printing("p-1")).toEqual([
      "admin",
      "printing-desk",
      "printing",
      "p-1",
    ]);
    expect(adminKeys.printingDesk.printing.prefix).toEqual(["admin", "printing-desk", "printing"]);
  });

  it("every desk key starts with the desk prefix", () => {
    const prefix = adminKeys.printingDesk.all;
    for (const key of [
      adminKeys.printingDesk.list("all"),
      adminKeys.printingDesk.cardPrintings("annie"),
      adminKeys.printingDesk.printing("p-1"),
      adminKeys.printingDesk.printing.prefix,
    ]) {
      expect(key.slice(0, prefix.length)).toEqual(prefix);
    }
  });
});

describe("adminKeys.priceMappings", () => {
  it("bySource returns tuple with config source", () => {
    expect(adminKeys.priceMappings.bySource(mockConfig)).toEqual(["admin", "tcgplayer"]);
  });

  it("bySourceAndFilter returns tuple with source, mappings, and showAll flag", () => {
    expect(adminKeys.priceMappings.bySourceAndFilter(mockConfig, true)).toEqual([
      "admin",
      "tcgplayer",
      "mappings",
      { all: true },
    ]);
  });

  it("bySourceAndFilter with showAll=false", () => {
    expect(adminKeys.priceMappings.bySourceAndFilter(mockConfig, false)).toEqual([
      "admin",
      "tcgplayer",
      "mappings",
      { all: false },
    ]);
  });
});

describe("adminKeys.unifiedMappings", () => {
  it("all", () => {
    expect(adminKeys.unifiedMappings.all).toEqual(["admin", "unified-mappings"]);
  });

  it("list", () => {
    expect(adminKeys.unifiedMappings.list).toEqual(["admin", "unified-mappings", "list"]);
  });

  it("byCard", () => {
    expect(adminKeys.unifiedMappings.byCard("c-1")).toEqual([
      "admin",
      "unified-mappings",
      "card",
      "c-1",
    ]);
  });
});
