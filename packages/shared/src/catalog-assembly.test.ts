import { describe, expect, it } from "vitest";

import type {
  CatalogAssemblyInput,
  CatalogChannelLinkRowInput,
  CatalogChannelRowInput,
  CatalogMarkerRowInput,
} from "./catalog-assembly.js";
import {
  assembleCatalogStaticParts,
  buildBansByCard,
  buildChannelsByPrinting,
  buildCustomTagAssignments,
  buildErrataByCard,
  indexMarkersBySlug,
  resolveMarkers,
  shapeCards,
  shapePrintings,
  shapeSets,
} from "./catalog-assembly.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const markerRows: CatalogMarkerRowInput[] = [
  { id: "m-promo", slug: "promo", label: "Promo", description: "Promotional" },
  { id: "m-champ", slug: "champion", label: "Champion", description: null },
];

// A small channel tree: "Events" (root) → "Worlds 2025" (child).
const allChannels: CatalogChannelRowInput[] = [
  {
    id: "c-events",
    slug: "events",
    label: "Events",
    description: null,
    kind: "event",
    parentId: null,
    childrenLabel: "Tournament",
  },
  {
    id: "c-worlds",
    slug: "worlds-2025",
    label: "Worlds 2025",
    description: null,
    kind: "event",
    parentId: "c-events",
    childrenLabel: null,
  },
];

const channelLinkRow: CatalogChannelLinkRowInput = {
  printingId: "p1",
  channelId: "c-worlds",
  channelSlug: "worlds-2025",
  channelLabel: "Worlds 2025",
  channelDescription: null,
  channelKind: "event",
  channelParentId: "c-events",
  channelChildrenLabel: null,
  distributionNote: "Top 8 prize",
};

// ── indexMarkersBySlug / resolveMarkers ──────────────────────────────────────

describe("indexMarkersBySlug + resolveMarkers", () => {
  it("indexes markers by slug and resolves slug arrays to full markers", () => {
    const bySlug = indexMarkersBySlug(markerRows);
    expect(bySlug.size).toBe(2);
    expect(resolveMarkers(["champion", "promo"], bySlug)).toEqual([
      { id: "m-champ", slug: "champion", label: "Champion", description: null },
      { id: "m-promo", slug: "promo", label: "Promo", description: "Promotional" },
    ]);
  });

  it("returns an empty array for an unmarked printing", () => {
    expect(resolveMarkers([], indexMarkersBySlug(markerRows))).toEqual([]);
  });

  it("skips slugs missing from the map (stale denormalized data)", () => {
    const bySlug = indexMarkersBySlug(markerRows);
    expect(resolveMarkers(["promo", "ghost"], bySlug)).toEqual([
      { id: "m-promo", slug: "promo", label: "Promo", description: "Promotional" },
    ]);
  });
});

// ── buildChannelsByPrinting ──────────────────────────────────────────────────

describe("buildChannelsByPrinting", () => {
  it("resolves the ancestor label chain (root → direct parent)", () => {
    const map = buildChannelsByPrinting([channelLinkRow], allChannels);
    const links = map.get("p1");
    expect(links).toHaveLength(1);
    expect(links?.[0]).toEqual({
      channel: {
        id: "c-worlds",
        slug: "worlds-2025",
        label: "Worlds 2025",
        description: null,
        kind: "event",
        parentId: "c-events",
        childrenLabel: null,
      },
      distributionNote: "Top 8 prize",
      ancestorLabels: ["Events"],
    });
  });

  it("groups multiple channels under one printing", () => {
    const second: CatalogChannelLinkRowInput = {
      ...channelLinkRow,
      channelId: "c-events",
      channelSlug: "events",
      channelLabel: "Events",
      channelParentId: null,
    };
    const map = buildChannelsByPrinting([channelLinkRow, second], allChannels);
    expect(map.get("p1")).toHaveLength(2);
  });

  it("returns no entry for a printing with no channel links", () => {
    const map = buildChannelsByPrinting([], allChannels);
    expect(map.get("p1")).toBeUndefined();
  });

  it("yields an empty ancestor chain for a root-level channel", () => {
    const rootLink: CatalogChannelLinkRowInput = {
      ...channelLinkRow,
      channelId: "c-events",
      channelParentId: null,
    };
    const map = buildChannelsByPrinting([rootLink], allChannels);
    expect(map.get("p1")?.[0].ancestorLabels).toEqual([]);
  });

  it("does not loop forever on a cyclic parent graph", () => {
    const cyclic: CatalogChannelRowInput[] = [
      { ...allChannels[0], parentId: "c-worlds" },
      { ...allChannels[1], parentId: "c-events" },
    ];
    const map = buildChannelsByPrinting([channelLinkRow], cyclic);
    // The depth cap (32) keeps the walk finite; we only assert it terminates.
    expect(map.get("p1")?.[0].ancestorLabels.length).toBeLessThanOrEqual(32);
  });
});

// ── buildErrataByCard ────────────────────────────────────────────────────────

describe("buildErrataByCard", () => {
  it("normalizes a Date effectiveDate to a string and keeps null as null", () => {
    const map = buildErrataByCard([
      {
        cardId: "card-a",
        correctedRulesText: "fixed",
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: "https://example.test",
        effectiveDate: new Date("2025-01-02T00:00:00.000Z"),
      },
      {
        cardId: "card-b",
        correctedRulesText: null,
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: null,
        effectiveDate: null,
      },
    ]);
    expect(String(map.get("card-a")?.effectiveDate)).toContain("2025");
    expect(map.get("card-b")?.effectiveDate).toBeNull();
  });

  it("accepts a string effectiveDate unchanged", () => {
    const map = buildErrataByCard([
      {
        cardId: "card-c",
        correctedRulesText: null,
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: null,
        effectiveDate: "2024-12-31",
      },
    ]);
    expect(map.get("card-c")?.effectiveDate).toBe("2024-12-31");
  });
});

// ── buildBansByCard ──────────────────────────────────────────────────────────

describe("buildBansByCard", () => {
  it("groups multiple bans under one card", () => {
    const map = buildBansByCard([
      {
        cardId: "card-a",
        formatId: "f1",
        formatName: "Constructed",
        bannedAt: "2025-01-01",
        reason: "too strong",
      },
      {
        cardId: "card-a",
        formatId: "f2",
        formatName: "Draft",
        bannedAt: "2025-02-01",
        reason: null,
      },
    ]);
    expect(map.get("card-a")).toHaveLength(2);
    expect(map.get("card-a")?.[0]).toEqual({
      formatId: "f1",
      formatName: "Constructed",
      bannedAt: "2025-01-01",
      reason: "too strong",
    });
  });

  it("returns an empty map for no bans", () => {
    expect(buildBansByCard([]).size).toBe(0);
  });
});

// ── buildCustomTagAssignments ────────────────────────────────────────────────

describe("buildCustomTagAssignments", () => {
  it("groups and sorts slugs per card deterministically", () => {
    const map = buildCustomTagAssignments([
      { cardId: "card-a", slug: "zaun" },
      { cardId: "card-a", slug: "ionia" },
      { cardId: "card-b", slug: "noxus" },
    ]);
    expect(map.get("card-a")).toEqual(["ionia", "zaun"]);
    expect(map.get("card-b")).toEqual(["noxus"]);
  });

  it("returns an empty map for no assignments", () => {
    expect(buildCustomTagAssignments([]).size).toBe(0);
  });
});

// ── shapeSets / shapeCards / shapePrintings ──────────────────────────────────

describe("shapeSets", () => {
  it("passes through the set columns", () => {
    expect(
      shapeSets([
        {
          id: "s1",
          slug: "origins",
          name: "Origins",
          releasedAt: "2025-06-01",
          released: true,
          setType: "main",
        },
      ]),
    ).toEqual([
      {
        id: "s1",
        slug: "origins",
        name: "Origins",
        releasedAt: "2025-06-01",
        released: true,
        setType: "main",
      },
    ]);
  });
});

describe("shapeCards", () => {
  it("merges errata and bans, defaulting missing ones to null / []", () => {
    const cards = shapeCards(
      [
        {
          id: "card-a",
          slug: "a",
          name: "Ahri",
          type: "legend",
          types: ["legend"],
          might: null,
          energy: 3,
          power: 2,
          mightBonus: null,
          keywords: ["Unique"],
          tags: ["Ahri"],
          domains: ["mind"],
          superTypes: [],
        },
      ],
      new Map(),
      new Map(),
    );
    expect(cards["card-a"].errata).toBeNull();
    expect(cards["card-a"].bans).toEqual([]);
    expect(cards["card-a"]).not.toHaveProperty("id");
    expect(cards["card-a"].domains).toEqual(["mind"]);
  });
});

describe("shapePrintings", () => {
  it("resolves markers, channels and images and drops the id from the value", () => {
    const printings = shapePrintings(
      [
        {
          id: "p1",
          cardId: "card-a",
          setId: "s1",
          shortCode: "001",
          rarity: "rare",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          size: "standard",
          artist: "Artist",
          publicCode: "001/100",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          printedName: null,
          printedYear: 2025,
          language: "EN",
          markerSlugs: ["promo"],
          comment: null,
          canonicalRank: 7,
        },
      ],
      indexMarkersBySlug(markerRows),
      buildChannelsByPrinting([channelLinkRow], allChannels),
      new Map([["p1", [{ face: "front", imageId: "img-1" }]]]),
    );
    const value = printings.p1;
    expect(value).not.toHaveProperty("id");
    expect(value.canonicalRank).toBe(7);
    expect(value.markers.map((m) => m.slug)).toEqual(["promo"]);
    expect(value.distributionChannels).toHaveLength(1);
    expect(value.images).toEqual([{ face: "front", imageId: "img-1" }]);
  });

  it("defaults missing channels and images to empty arrays", () => {
    const printings = shapePrintings(
      [
        {
          id: "p2",
          cardId: "card-a",
          setId: "s1",
          shortCode: "002",
          rarity: "common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          size: "standard",
          artist: "Artist",
          publicCode: "002/100",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          printedName: null,
          printedYear: null,
          language: "EN",
          markerSlugs: [],
          comment: null,
          canonicalRank: 1,
        },
      ],
      indexMarkersBySlug(markerRows),
      new Map(),
      new Map(),
    );
    expect(printings.p2.markers).toEqual([]);
    expect(printings.p2.distributionChannels).toEqual([]);
    expect(printings.p2.images).toEqual([]);
  });
});

// ── assembleCatalogStaticParts (integration of the pure pieces) ───────────────

describe("assembleCatalogStaticParts", () => {
  const input: CatalogAssemblyInput = {
    setRows: [
      {
        id: "s1",
        slug: "origins",
        name: "Origins",
        releasedAt: "2025-06-01",
        released: true,
        setType: "main",
      },
    ],
    cardRows: [
      {
        id: "card-a",
        slug: "ahri",
        name: "Ahri",
        type: "legend",
        types: ["legend"],
        might: null,
        energy: 3,
        power: 2,
        mightBonus: null,
        keywords: [],
        tags: [],
        domains: ["mind"],
        superTypes: [],
      },
    ],
    printingRows: [
      {
        id: "p1",
        cardId: "card-a",
        setId: "s1",
        shortCode: "001",
        rarity: "rare",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        size: "standard",
        artist: "Artist",
        publicCode: "001/100",
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        printedName: null,
        printedYear: 2025,
        language: "EN",
        markerSlugs: ["promo"],
        comment: null,
        canonicalRank: 1,
      },
    ],
    imageRows: [{ printingId: "p1", face: "front", imageId: "img-1" }],
    banRows: [
      {
        cardId: "card-a",
        formatId: "f1",
        formatName: "Constructed",
        bannedAt: "2025-01-01",
        reason: null,
      },
    ],
    errataRows: [
      {
        cardId: "card-a",
        correctedRulesText: "fixed",
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: null,
        effectiveDate: null,
      },
    ],
    markerRows,
    allChannels,
    channelLinkRows: [channelLinkRow],
    customTagAssignmentRows: [
      { cardId: "card-a", slug: "zaun" },
      { cardId: "card-a", slug: "ionia" },
    ],
  };

  it("assembles all static parts with cross-references resolved", () => {
    const result = assembleCatalogStaticParts(input);

    expect(result.sets).toHaveLength(1);
    expect(result.cards["card-a"].name).toBe("Ahri");
    expect(result.cards["card-a"].errata?.correctedRulesText).toBe("fixed");
    expect(result.cards["card-a"].bans).toHaveLength(1);

    expect(result.printings.p1.markers.map((m) => m.slug)).toEqual(["promo"]);
    expect(result.printings.p1.distributionChannels[0].ancestorLabels).toEqual(["Events"]);
    expect(result.printings.p1.images).toEqual([{ face: "front", imageId: "img-1" }]);
    expect(result.printings.p1.canonicalRank).toBe(1);

    expect(result.customTagAssignments["card-a"]).toEqual(["ionia", "zaun"]);
  });

  it("does not emit a totalCopies field (dynamic, merged by the route)", () => {
    const result = assembleCatalogStaticParts(input);
    expect(result).not.toHaveProperty("totalCopies");
  });

  it("handles a fully empty catalog", () => {
    const empty = assembleCatalogStaticParts({
      setRows: [],
      cardRows: [],
      printingRows: [],
      imageRows: [],
      banRows: [],
      errataRows: [],
      markerRows: [],
      allChannels: [],
      channelLinkRows: [],
      customTagAssignmentRows: [],
    });
    expect(empty.sets).toEqual([]);
    expect(empty.cards).toEqual({});
    expect(empty.printings).toEqual({});
    expect(empty.customTagAssignments).toEqual({});
  });
});
