import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

import { resolveEntryImageId } from "./list-thumbnail";

function cardEntry(cardId: string): ListEntryDetailResponse {
  return {
    id: "entry-1",
    listId: "list-1",
    cardName: "Test Card",
    cardType: "unit",
    quantity: 1,
    kind: "card",
    cardId,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

function printingEntry(printingId: string, imageId: string | null): ListEntryDetailResponse {
  return {
    id: "entry-2",
    listId: "list-1",
    cardName: "Test Card",
    cardType: "unit",
    quantity: 1,
    kind: "printing",
    printingId,
    setId: "set-1",
    rarity: "common",
    finish: "normal",
    shortCode: "OGN-001",
    language: "EN",
    imageId,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

function byId(printings: Printing[]): Record<string, Printing> {
  return Object.fromEntries(printings.map((p) => [p.id, p]));
}

describe("resolveEntryImageId", () => {
  it("picks the first printing's first image for a card-kind entry", () => {
    const printing = stubPrinting({
      cardId: "card-1",
      images: [
        { face: "front", imageId: "img-front" },
        { face: "back", imageId: "img-back" },
      ],
    });
    const byCard = new Map([["card-1", [printing]]]);

    const result = resolveEntryImageId(cardEntry("card-1"), byId([printing]), byCard);

    expect(result).toBe("img-front");
  });

  it("returns null for a card-kind entry whose card has no printings in the catalog", () => {
    const result = resolveEntryImageId(cardEntry("missing-card"), {}, new Map());

    expect(result).toBeNull();
  });

  it("returns null for a card-kind entry whose first printing has no images", () => {
    const printing = stubPrinting({ cardId: "card-1", images: [] });
    const byCard = new Map([["card-1", [printing]]]);

    const result = resolveEntryImageId(cardEntry("card-1"), byId([printing]), byCard);

    expect(result).toBeNull();
  });

  it("uses the entry's own imageId for a printing-kind entry", () => {
    const result = resolveEntryImageId(
      printingEntry("printing-1", "img-from-entry"),
      {},
      new Map(),
    );

    expect(result).toBe("img-from-entry");
  });

  it("falls back to the catalog printing's first image when a printing-kind entry has no imageId", () => {
    const printing = stubPrinting({
      id: "printing-1",
      images: [{ face: "front", imageId: "img-catalog" }],
    });

    const result = resolveEntryImageId(
      printingEntry("printing-1", null),
      byId([printing]),
      new Map(),
    );

    expect(result).toBe("img-catalog");
  });
});
