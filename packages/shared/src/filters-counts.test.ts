import { describe, expect, it } from "vitest";

import { computeFilterCounts } from "./filters-counts.js";
import { emptyFilters, makePrinting } from "./filters-test-helpers.js";

describe("computeFilterCounts", () => {
  const sample = [
    makePrinting({
      id: "p1",
      cardId: "c1",
      language: "EN",
      rarity: "common",
      card: { slug: "c1", domains: ["fury"] },
    }),
    makePrinting({
      id: "p2",
      cardId: "c1",
      language: "DE",
      rarity: "common",
      card: { slug: "c1", domains: ["fury"] },
    }),
    makePrinting({
      id: "p3",
      cardId: "c2",
      language: "EN",
      rarity: "rare",
      card: { slug: "c2", domains: ["calm"] },
    }),
    makePrinting({
      id: "p4",
      cardId: "c3",
      language: "JA",
      rarity: "rare",
      card: { slug: "c3", domains: ["mind", "body"] },
    }),
  ];

  it("counts printings per option when no filters are active", () => {
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "printing" });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
    expect(counts.languages.get("JA")).toBe(1);
    expect(counts.rarities.get("common")).toBe(2);
    expect(counts.rarities.get("rare")).toBe(2);
    expect(counts.domains.get("fury")).toBe(2);
    expect(counts.domains.get("mind")).toBe(1);
  });

  it("excludes the dim's own filter so multi-select still widens", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
    expect(counts.languages.get("JA")).toBe(1);
  });

  it("narrows other dims based on the active filter", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(1);
  });

  it("ignores both the include and exclude of the faceted dimension", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languagesExclude: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.languages.get("EN")).toBe(2);
    expect(counts.languages.get("DE")).toBe(1);
  });

  it("a dimension's exclude narrows other dimensions' counts", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languagesExclude: ["EN"] }), {
      countBy: "printing",
    });
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(1);
  });

  it("counts the standard flag over the matching subset", () => {
    const cards = [
      makePrinting({ id: "s1", cardId: "s1", rarity: "common", finish: "normal" }),
      makePrinting({ id: "s2", cardId: "s2", rarity: "common", finish: "foil" }),
    ];
    const counts = computeFilterCounts(cards, emptyFilters(), { countBy: "printing" });
    expect(counts.flags.standard).toBe(1);
  });

  it("returns 0 (missing) for options with no matches under current filters", () => {
    const counts = computeFilterCounts(sample, emptyFilters({ languages: ["DE"] }), {
      countBy: "printing",
    });
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare") ?? 0).toBe(0);
    expect(counts.domains.get("fury")).toBe(1);
    expect(counts.domains.get("calm") ?? 0).toBe(0);
  });

  it("counts unique cards (not printings) when countBy='card'", () => {
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("fury")).toBe(1);
    expect(counts.rarities.get("common")).toBe(1);
    expect(counts.rarities.get("rare")).toBe(2);
  });

  it("counts each domain of a multi-domain card", () => {
    const counts = computeFilterCounts(sample, emptyFilters(), { countBy: "card" });
    expect(counts.domains.get("mind")).toBe(1);
    expect(counts.domains.get("body")).toBe(1);
  });

  describe("markers and channels", () => {
    const channelStore = {
      id: "ch1",
      slug: "store",
      label: "Store",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const channelEvent = {
      id: "ch2",
      slug: "event",
      label: "Event",
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    };
    const markerChannelSample = [
      makePrinting({
        id: "p1",
        cardId: "c1",
        rarity: "common",
        markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
        distributionChannels: [
          { channel: channelStore, distributionNote: null, ancestorLabels: [] },
        ],
      }),
      makePrinting({
        id: "p2",
        cardId: "c2",
        rarity: "rare",
        markers: [
          { id: "m1", slug: "promo", label: "Promo", description: null },
          { id: "m2", slug: "top-8", label: "Top 8", description: null },
        ],
        distributionChannels: [
          { channel: channelEvent, distributionNote: null, ancestorLabels: [] },
        ],
      }),
      makePrinting({
        id: "p3",
        cardId: "c3",
        rarity: "rare",
        markers: [],
        distributionChannels: [],
      }),
    ];

    it("counts printings per marker and per channel", () => {
      const counts = computeFilterCounts(markerChannelSample, emptyFilters(), {
        countBy: "printing",
      });
      expect(counts.markers.get("promo")).toBe(2);
      expect(counts.markers.get("top-8")).toBe(1);
      expect(counts.channels.get("store")).toBe(1);
      expect(counts.channels.get("event")).toBe(1);
    });

    it("excludes the marker dim's own filter so multi-select still widens", () => {
      const counts = computeFilterCounts(
        markerChannelSample,
        emptyFilters({ markerSlugs: ["top-8"] }),
        { countBy: "printing" },
      );
      expect(counts.markers.get("promo")).toBe(2);
      expect(counts.markers.get("top-8")).toBe(1);
    });

    it("narrows channels based on an active marker filter", () => {
      const counts = computeFilterCounts(
        markerChannelSample,
        emptyFilters({ markerSlugs: ["top-8"] }),
        { countBy: "printing" },
      );
      expect(counts.channels.get("event")).toBe(1);
      expect(counts.channels.get("store") ?? 0).toBe(0);
    });
  });

  describe("flags", () => {
    const flagSample = [
      makePrinting({
        id: "p-signed",
        cardId: "c-signed",
        isSigned: true,
        card: { slug: "c-signed", bans: [], errata: null },
      }),
      makePrinting({
        id: "p-plain",
        cardId: "c-plain",
        isSigned: false,
        card: {
          slug: "c-plain",
          bans: [
            {
              formatId: "f1",
              formatName: "Standard",
              bannedAt: "2026-01-01",
              reason: "test",
            },
          ],
          errata: {
            correctedRulesText: "x",
            correctedEffectText: null,
            source: "test",
            sourceUrl: null,
            effectiveDate: null,
          },
        },
      }),
      makePrinting({
        id: "p-promo",
        cardId: "c-promo",
        isSigned: false,
        markers: [{ id: "m1", slug: "promo-stamp", label: "Promo", description: null }],
        card: { slug: "c-promo", bans: [], errata: null },
      }),
    ];

    it("counts flags at their primary-on state when the chip is null/true", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters(), { countBy: "printing" });
      expect(counts.flags.signed).toBe(1);
      expect(counts.presence.markers.any).toBe(1);
      expect(counts.flags.banned).toBe(1);
      expect(counts.flags.errata).toBe(1);
    });

    it("counts flags at their false state when the chip is in 'Not X' mode", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters({ isSigned: false }), {
        countBy: "printing",
      });
      expect(counts.flags.signed).toBe(2);
    });

    it("flag counts respect other active filters", () => {
      const counts = computeFilterCounts(flagSample, emptyFilters({ domains: ["calm"] }), {
        countBy: "printing",
      });
      expect(counts.flags.signed).toBe(0);
      expect(counts.presence.markers.any).toBe(0);
      expect(counts.flags.banned).toBe(0);
      expect(counts.flags.errata).toBe(0);
    });
  });

  describe("presence counts", () => {
    const presenceSample = [
      makePrinting({
        id: "pm1",
        cardId: "cm1",
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
        card: { slug: "cm1", keywords: ["Shield"] },
      }),
      makePrinting({
        id: "pm2",
        cardId: "cm2",
        markers: [{ id: "2", slug: "top-8", label: "Top 8", description: null }],
        card: { slug: "cm2", keywords: [] },
      }),
      makePrinting({
        id: "pm3",
        cardId: "cm3",
        markers: [],
        card: { slug: "cm3", keywords: [] },
      }),
    ];

    it("partitions each dimension into any / none", () => {
      const counts = computeFilterCounts(presenceSample, emptyFilters(), { countBy: "printing" });
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
      expect(counts.presence.keywords).toEqual({ any: 1, none: 2 });
    });

    it("ignores the dimension's own presence selection so counts still widen", () => {
      const counts = computeFilterCounts(
        presenceSample,
        emptyFilters({ presence: { markers: "none" } }),
        { countBy: "printing" },
      );
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
    });

    it("ignores the dimension's own value selection when counting presence", () => {
      const counts = computeFilterCounts(presenceSample, emptyFilters({ markerSlugs: ["promo"] }), {
        countBy: "printing",
      });
      expect(counts.presence.markers).toEqual({ any: 2, none: 1 });
    });

    it("respects other active filters", () => {
      const counts = computeFilterCounts(
        presenceSample,
        emptyFilters({ presence: { keywords: "any" } }),
        { countBy: "printing" },
      );
      expect(counts.presence.markers).toEqual({ any: 1, none: 0 });
    });
  });

  describe("ranges", () => {
    const rangeSample = [
      makePrinting({
        id: "rp1",
        cardId: "rc1",
        rarity: "common",
        card: { slug: "rc1", energy: 1, might: 2, power: 3 },
      }),
      makePrinting({
        id: "rp2",
        cardId: "rc2",
        rarity: "rare",
        card: { slug: "rc2", energy: 5, might: 4, power: 7 },
      }),
      makePrinting({
        id: "rp3",
        cardId: "rc3",
        rarity: "rare",
        card: { slug: "rc3", energy: null, might: null, power: null },
      }),
    ];

    it("returns the full bounds when no filters narrow the set", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters(), { countBy: "printing" });
      expect(counts.ranges.energy).toEqual({ min: 1, max: 5, hasNullStat: true });
      expect(counts.ranges.might).toEqual({ min: 2, max: 4, hasNullStat: true });
      expect(counts.ranges.power).toEqual({ min: 3, max: 7, hasNullStat: true });
    });

    it("narrows bounds based on other active filters", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters({ rarities: ["common"] }), {
        countBy: "printing",
      });
      expect(counts.ranges.energy).toEqual({ min: 1, max: 1, hasNullStat: false });
      expect(counts.ranges.might).toEqual({ min: 2, max: 2, hasNullStat: false });
    });

    it("ignores its own filter so the slider can still drag outward", () => {
      const counts = computeFilterCounts(
        rangeSample,
        emptyFilters({ energy: { min: 1, max: 1 } }),
        { countBy: "printing" },
      );
      expect(counts.ranges.energy).toEqual({ min: 1, max: 5, hasNullStat: true });
    });

    it("returns 0..0 price bounds when no getPrice resolver is supplied", () => {
      const counts = computeFilterCounts(rangeSample, emptyFilters(), { countBy: "printing" });
      expect(counts.ranges.price).toEqual({ min: 0, max: 0 });
    });
  });
});
