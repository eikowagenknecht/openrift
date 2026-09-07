import type { Marker, PrintingCitation, PrintingDistributionChannel } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  buildPrintingsResponse,
  resolveFallbackArt,
  resolveMarkers,
} from "./printing-presenters.js";

describe("resolveFallbackArt", () => {
  it("omits both fields for the auto default", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "auto", fallbackImageId: null })).toEqual({});
  });

  it("emits the mode alone when the substitute is suppressed", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "none", fallbackImageId: null })).toEqual({
      fallbackArtMode: "none",
    });
  });

  it("emits mode and image id together for a pin", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "pinned", fallbackImageId: "img-1" })).toEqual({
      fallbackArtMode: "pinned",
      fallbackImageId: "img-1",
    });
  });

  it("degrades a pin with no servable image to auto", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "pinned", fallbackImageId: null })).toEqual({});
  });

  it("treats an unknown mode as auto", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "future-mode", fallbackImageId: null })).toEqual(
      {},
    );
  });
});

const MARKER: Marker = {
  id: "m-1",
  slug: "promo",
  label: "Promo",
  description: null,
};

function printingRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    cardId: "card-1",
    setId: "set-1",
    shortCode: "OGN-202",
    rarity: "rare",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: ["promo"],
    fallbackArtMode: "auto",
    fallbackImageId: null,
    finish: "foil",
    size: "standard",
    artist: "Kudos Productions",
    publicCode: "OGN-202/298",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: 2025,
    language: "EN",
    comment: null,
    canonicalRank: 1,
    ...overrides,
  } as never;
}

function citation(id: string): PrintingCitation {
  return { id, label: "Launch party unboxing", sourceUrl: "https://youtu.be/abc" };
}

const NO_CHANNELS = new Map<string, PrintingDistributionChannel[]>();
const MARKERS = new Map([["promo", MARKER]]);

describe("resolveMarkers", () => {
  it("resolves known slugs and drops stale ones", () => {
    expect(resolveMarkers(["promo", "gone"], MARKERS)).toEqual([MARKER]);
  });
});

describe("buildPrintingsResponse", () => {
  it("attaches a printing's citations", () => {
    const citations = new Map([["p-1", [citation("c-1"), citation("c-2")]]]);

    const [printing] = buildPrintingsResponse([printingRow("p-1")], [], {
      markerBySlug: MARKERS,
      channelsByPrinting: NO_CHANNELS,
      citationsByPrinting: citations,
    });

    expect(printing!.citations).toHaveLength(2);
  });

  it("omits the key entirely for an uncited printing", () => {
    const [printing] = buildPrintingsResponse([printingRow("p-1")], [], {
      markerBySlug: MARKERS,
      channelsByPrinting: NO_CHANNELS,
      citationsByPrinting: new Map(),
    });

    expect(printing!.citations).toBeUndefined();
    expect(Object.hasOwn(printing!, "citations")).toBe(false);
  });

  it("keeps each printing's citations to itself", () => {
    const citations = new Map([["p-2", [citation("c-1")]]]);

    const [first, second] = buildPrintingsResponse([printingRow("p-1"), printingRow("p-2")], [], {
      markerBySlug: MARKERS,
      channelsByPrinting: NO_CHANNELS,
      citationsByPrinting: citations,
    });

    expect(first!.citations).toBeUndefined();
    expect(second!.citations).toEqual([citation("c-1")]);
  });

  it("still resolves markers, channels, and images alongside citations", () => {
    const link: PrintingDistributionChannel = {
      channel: {
        id: "ch-1",
        slug: "launch-party",
        label: "Launch Party",
        description: null,
        kind: "event",
        parentId: null,
        childrenLabel: null,
      },
      distributionNote: "Handed out at the door",
      ancestorLabels: [],
    };

    const [printing] = buildPrintingsResponse(
      [printingRow("p-1")],
      [{ printingId: "p-1", face: "front", imageId: "img-1" } as never],
      {
        markerBySlug: MARKERS,
        channelsByPrinting: new Map([["p-1", [link]]]),
        citationsByPrinting: new Map([["p-1", [citation("c-1")]]]),
      },
    );

    expect(printing!.markers).toEqual([MARKER]);
    expect(printing!.distributionChannels).toEqual([link]);
    expect(printing!.images).toEqual([{ face: "front", imageId: "img-1" }]);
    expect(printing!.citations).toEqual([citation("c-1")]);
  });
});
