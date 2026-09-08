import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { describe, expect, it } from "vitest";

import { basePrintingForLanguage, defaultCardLanguage } from "./printing-desk-base";

function printing(printingId: string, language: string): DeskPrintingRow {
  return {
    printingId,
    cardId: "c-1",
    cardSlug: "annie-dark-child",
    cardName: "Annie, Dark Child",
    cardType: "unit",
    setId: "s-1",
    setName: "Origins",
    setSlug: "origins",
    shortCode: "OGN-101",
    publicCode: "OGN-101",
    rarity: "epic",
    finish: "standard",
    language,
    size: "standard",
    artist: "Kudos Productions",
    markerSlugs: [],
    distributionChannelSlugs: [],
    announcedAt: null,
    releasedAt: null,
    releasePrecision: null,
    comment: null,
    imageCount: 0,
    activeImageFileId: null,
    activeImageUrl: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    createdByMe: false,
  };
}

describe("basePrintingForLanguage", () => {
  it("prefers the printing in the shown language", () => {
    const printings = [printing("p-en", "en"), printing("p-de", "de")];

    expect(basePrintingForLanguage(printings, "de")?.printingId).toBe("p-de");
  });

  it("falls back to the first printing when the language has none", () => {
    const printings = [printing("p-en", "en"), printing("p-de", "de")];

    expect(basePrintingForLanguage(printings, "ja")?.printingId).toBe("p-en");
  });

  it("is undefined when the card has no printings at all", () => {
    expect(basePrintingForLanguage([], "en")).toBeUndefined();
  });
});

describe("defaultCardLanguage", () => {
  it("takes the user's first language the card actually has", () => {
    expect(defaultCardLanguage(["en", "de"], ["ja", "de", "en"])).toBe("de");
  });

  it("falls back to the card's first language", () => {
    expect(defaultCardLanguage(["fr", "en"], ["ja"])).toBe("fr");
  });

  it("falls back to English when the card has no languages", () => {
    expect(defaultCardLanguage([], ["ja"])).toBe("en");
  });
});
