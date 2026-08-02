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

  it("collections.all keys per user", () => {
    expect(queryKeys.collections.all("user-1")).toEqual(["collections", "user-1"]);
  });

  it("copies.all keys per user", () => {
    expect(queryKeys.copies.all("user-1")).toEqual(["copies", "user-1"]);
  });

  it("copies.byCollection keys per (user, collection)", () => {
    expect(queryKeys.copies.byCollection("user-1", "abc")).toEqual(["copies", "user-1", "abc"]);
  });

  it("copies.listMemberships keys per (user, copyIds) with a null exclude slot by default", () => {
    expect(queryKeys.copies.listMemberships("user-1", ["c1", "c2"])).toEqual([
      "copies",
      "user-1",
      "list-memberships",
      ["c1", "c2"],
      null,
    ]);
  });

  it("copies.listMemberships distinguishes an excludeListId so the 'Sold' check caches separately", () => {
    expect(queryKeys.copies.listMemberships("user-1", ["c1"], "lst-9")).toEqual([
      "copies",
      "user-1",
      "list-memberships",
      ["c1"],
      "lst-9",
    ]);
  });

  it("decks.all keys per user", () => {
    expect(queryKeys.decks.all("user-1")).toEqual(["decks", "user-1"]);
  });

  it("decks.detail keys per (user, deck)", () => {
    expect(queryKeys.decks.detail("user-1", "deck-1")).toEqual(["decks", "user-1", "deck-1"]);
  });

  it("ownedCount.all", () => {
    expect(queryKeys.ownedCount.all).toEqual(["ownedCount"]);
  });

  it("priceHistory.byPrinting returns tuple with printingId and range", () => {
    expect(queryKeys.priceHistory.byPrinting("p1", "30d")).toEqual(["priceHistory", "p1", "30d"]);
  });

  // The card browsers' per-printing trade markers rely on this nesting: trade
  // mutations invalidate `trades.all`, and react-query matches by prefix, so a
  // key nested under it is refreshed without its own invalidation entry. Move
  // it out from under the prefix and the markers go stale after every accept.
  it("trades.liveByPrinting nests under the trades.all invalidation prefix", () => {
    const prefix = queryKeys.trades.all("user-1");
    const key = queryKeys.trades.liveByPrinting("user-1");
    expect(key).toEqual(["trades", "user-1", "live-by-printing"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });

  // Same reason as above: the giver's copy picker reads which copies a trade
  // could take, and every one of them stops being a candidate the moment some
  // other accept pins it. Nested under `trades.all`, the entry is dropped by
  // the invalidation each trade mutation already does.
  it("trades.copyOptions nests under the trades.all invalidation prefix", () => {
    const prefix = queryKeys.trades.all("user-1");
    const key = queryKeys.trades.copyOptions("user-1", "trade-1");
    expect(key).toEqual(["trades", "user-1", "copy-options", "trade-1"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });
});

// ---------------------------------------------------------------------------
// Admin keys
// ---------------------------------------------------------------------------

describe("queryKeys.admin", () => {
  it("me is keyed per user so identities never share a cache slot", () => {
    expect(queryKeys.admin.me("user-1")).toEqual(["admin", "me", "user-1"]);
    expect(queryKeys.admin.me(null)).toEqual(["admin", "me", null]);
    expect(queryKeys.admin.me("user-1")).not.toEqual(queryKeys.admin.me("user-2"));
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
