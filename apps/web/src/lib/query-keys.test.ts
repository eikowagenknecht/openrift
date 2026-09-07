import { describe, expect, it } from "vitest";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

import { queryKeys } from "./query-keys";

const mockConfig: SourceMappingConfig = {
  source: "tcgplayer",
  displayName: "TCGplayer",
  shortName: "TCG",
  productUrl: (id: number) => `https://tcgplayer.com/product/${id}`,
};

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

  it("meta.decks keys the whole archive when no window is given", () => {
    expect(queryKeys.meta.decks()).toEqual(["meta", "decks"]);
  });

  it("meta.decks reads an empty window as the whole archive", () => {
    expect(queryKeys.meta.decks({})).toEqual(queryKeys.meta.decks());
  });

  it("meta.decks keys each window apart", () => {
    expect(queryKeys.meta.decks({ from: "2026-01-01", to: "2026-06-30" })).not.toEqual(
      queryKeys.meta.decks({ from: "2026-07-01" }),
    );
  });

  it("meta.decks keeps an open end apart from a closed one", () => {
    expect(queryKeys.meta.decks({ from: "2026-01-01" })).toEqual([
      "meta",
      "decks",
      {
        from: "2026-01-01",
        to: null,
        formats: null,
        formatsEx: null,
        tiers: null,
        tiersEx: null,
        countries: null,
        countriesEx: null,
        legend: null,
        player: null,
        limit: null,
      },
    ]);
  });

  it("meta.decks keys a facet include apart from the matching exclude", () => {
    expect(queryKeys.meta.decks({ tiers: ["premier"] })).not.toEqual(
      queryKeys.meta.decks({ tiersEx: ["premier"] }),
    );
    expect(queryKeys.meta.decks({ countries: ["DE"] })).not.toEqual(
      queryKeys.meta.decks({ countries: ["FR"] }),
    );
  });

  it("meta.decks keys the legend, the player and the cap apart", () => {
    expect(queryKeys.meta.decks({ legend: "card-1" })).not.toEqual(
      queryKeys.meta.decks({ legend: "card-2" }),
    );
    expect(queryKeys.meta.decks({ player: "renata" })).not.toEqual(
      queryKeys.meta.decks({ player: "ekko" }),
    );
    expect(queryKeys.meta.decks({ limit: 12 })).not.toEqual(queryKeys.meta.decks({ limit: 24 }));
  });

  it("meta.events keys the whole archive when no window is given", () => {
    expect(queryKeys.meta.events()).toEqual(["meta", "events"]);
    expect(queryKeys.meta.events({})).toEqual(queryKeys.meta.events());
  });

  it("meta.events keys each window apart, under the events base", () => {
    expect(queryKeys.meta.events({ from: "2026-01-01" })).toEqual([
      "meta",
      "events",
      { from: "2026-01-01", to: null },
    ]);
  });

  it("meta.counts keys the unfiltered archive plainly", () => {
    expect(queryKeys.meta.counts()).toEqual(["meta", "counts"]);
    expect(queryKeys.meta.counts({ format: "constructed" })).toEqual([
      "meta",
      "counts",
      { format: "constructed", dateFrom: null, dateTo: null },
    ]);
  });

  it("meta.legend keys an unscoped page under the slug alone", () => {
    expect(queryKeys.meta.legend("kennen")).toEqual(["meta", "legends", "kennen"]);
    expect(queryKeys.meta.legend("kennen", {})).toEqual(queryKeys.meta.legend("kennen"));
  });

  it("meta.legend keys each facet and page apart", () => {
    expect(queryKeys.meta.legend("kennen", { tiers: ["premier"] })).not.toEqual(
      queryKeys.meta.legend("kennen", { tiersEx: ["premier"] }),
    );
    expect(queryKeys.meta.legend("kennen", { page: 2 })).not.toEqual(
      queryKeys.meta.legend("kennen", { page: 3 }),
    );
    expect(queryKeys.meta.legend("kennen", { page: 2 })).not.toEqual(
      queryKeys.meta.legend("ekko", { page: 2 }),
    );
  });

  it("meta.deckCards keys under its own base", () => {
    expect(queryKeys.meta.deckCards({ to: "2026-06-30" })).toEqual([
      "meta",
      "deck-cards",
      { from: null, to: "2026-06-30" },
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

  it("trades.liveByPrinting nests under the trades.all invalidation prefix", () => {
    const prefix = queryKeys.trades.all("user-1");
    const key = queryKeys.trades.liveByPrinting("user-1");
    expect(key).toEqual(["trades", "user-1", "live-by-printing"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("trades.copyOptions nests under the trades.all invalidation prefix", () => {
    const prefix = queryKeys.trades.all("user-1");
    const key = queryKeys.trades.copyOptions("user-1", "trade-1");
    expect(key).toEqual(["trades", "user-1", "copy-options", "trade-1"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("trades.sheet nests under the trades.all invalidation prefix", () => {
    const prefix = queryKeys.trades.all("user-1");
    const key = queryKeys.trades.sheet("user-1", "member-1");
    expect(key).toEqual(["trades", "user-1", "sheet", "member-1"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });
});

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

  it("jobSchedules", () => {
    expect(queryKeys.admin.jobSchedules).toEqual(["admin", "job-schedules"]);
  });

  it("rehostStatus", () => {
    expect(queryKeys.admin.rehostStatus).toEqual(["admin", "rehost-status"]);
  });

  it("ignoredProducts", () => {
    expect(queryKeys.admin.ignoredProducts).toEqual(["admin", "ignored-products"]);
  });
});

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
