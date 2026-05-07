import type { DistributionChannelWithCount, PrintingDistributionChannel } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubPriceLookup, stubPrinting } from "@/test/factories";

import { asPromoSortField, buildPromoTreeFromMatches, sortPromoPrintings } from "./promo-filters";

function makeChannel(
  overrides: Partial<DistributionChannelWithCount> = {},
): DistributionChannelWithCount {
  return {
    id: overrides.id ?? "ch-id",
    slug: overrides.slug ?? "ch",
    label: overrides.label ?? "Channel",
    description: null,
    kind: "event",
    parentId: null,
    childrenLabel: null,
    cardCount: 1,
    printingCount: 1,
    ...overrides,
  };
}

function makeChannelLink(channelId: string): PrintingDistributionChannel {
  return {
    channel: {
      id: channelId,
      slug: channelId,
      label: channelId,
      description: null,
      kind: "event",
      parentId: null,
      childrenLabel: null,
    },
    distributionNote: null,
    ancestorLabels: [],
  };
}

describe("sortPromoPrintings", () => {
  const printings = [
    stubPrinting({
      id: "a",
      canonicalRank: 3,
      publicCode: "rb1-c",
      setId: "set-2",
      card: { name: "Charlie" },
    }),
    stubPrinting({
      id: "b",
      canonicalRank: 1,
      publicCode: "rb1-a",
      setId: "set-3",
      card: { name: "Alpha" },
    }),
    stubPrinting({
      id: "c",
      canonicalRank: 2,
      publicCode: "rb1-b",
      setId: "set-1",
      card: { name: "Bravo" },
    }),
  ];

  it("canonical preserves canonicalRank order", () => {
    expect(
      sortPromoPrintings({
        printings,
        sort: "canonical",
        prices: undefined,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("name sorts by card.name", () => {
    expect(
      sortPromoPrintings({
        printings,
        sort: "name",
        prices: undefined,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("code sorts by publicCode", () => {
    expect(
      sortPromoPrintings({
        printings,
        sort: "code",
        prices: undefined,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("recent sorts by setId desc", () => {
    expect(
      sortPromoPrintings({
        printings,
        sort: "recent",
        prices: undefined,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["b", "a", "c"]);
  });

  it("priceAsc sorts cheapest first; missing prices last", () => {
    const prices = stubPriceLookup({ a: { cardtrader: 50 }, b: { cardtrader: 5 } });
    expect(
      sortPromoPrintings({
        printings,
        sort: "priceAsc",
        prices,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["b", "a", "c"]);
  });

  it("priceDesc sorts most expensive first; missing prices last", () => {
    const prices = stubPriceLookup({ a: { cardtrader: 50 }, b: { cardtrader: 5 } });
    expect(
      sortPromoPrintings({
        printings,
        sort: "priceDesc",
        prices,
        priceMarketplace: "cardtrader",
      }).map((p) => p.id),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("asPromoSortField", () => {
  it("passes through known fields", () => {
    expect(asPromoSortField("name")).toBe("name");
    expect(asPromoSortField("priceDesc")).toBe("priceDesc");
  });

  it("falls back to canonical for unknown / missing values", () => {
    expect(asPromoSortField(undefined)).toBe("canonical");
    expect(asPromoSortField("id")).toBe("canonical");
    expect(asPromoSortField("energyAsc")).toBe("canonical");
  });
});

describe("buildPromoTreeFromMatches", () => {
  it("groups printings under each channel they link to and builds a tree", () => {
    const channels = [
      makeChannel({ id: "root", slug: "root", label: "Root" }),
      makeChannel({ id: "leaf", slug: "leaf", label: "Leaf", parentId: "root" }),
    ];
    const printings = [
      stubPrinting({ id: "p1", distributionChannels: [makeChannelLink("leaf")] }),
      stubPrinting({ id: "p2", distributionChannels: [makeChannelLink("leaf")] }),
    ];
    const tree = buildPromoTreeFromMatches(printings, channels);
    expect(tree).toHaveLength(1);
    expect(tree[0].channel.id).toBe("root");
    expect(tree[0].subtreePrintingIds.size).toBe(2);
    expect(tree[0].children[0].printings.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("returns empty leaves when no printings match", () => {
    const channels = [makeChannel({ id: "root", slug: "root", label: "Root" })];
    const tree = buildPromoTreeFromMatches([], channels);
    expect(tree).toHaveLength(1);
    expect(tree[0].subtreePrintingIds.size).toBe(0);
  });
});
