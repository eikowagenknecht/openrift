import { describe, expect, it } from "vitest";

import { findStandardArtFallback, isStandardPrinting } from "./standard.js";
import { makePrinting as stubPrinting } from "./test-factories.js";
import type { Marker, Printing } from "./types/catalog.js";

function makePrinting(overrides: Partial<Printing> = {}): Printing {
  return stubPrinting({
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    artist: "Jane Doe",
    publicCode: "ABCD",
    card: { slug: "SET1-001", domains: ["fury"], energy: 3, might: 2, power: 4, mightBonus: 0 },
    ...overrides,
  });
}

const aMarker: Marker = { id: "m1", slug: "stamp", label: "Stamp", description: null };

describe("isStandardPrinting", () => {
  const lowRarities = ["common", "uncommon"];
  const alwaysFoilRarities = ["rare", "epic"];
  const allRarities = [...lowRarities, ...alwaysFoilRarities, "showcase"];

  describe("finish × rarity matrix (normal art, unsigned, no markers, no foil twin)", () => {
    for (const rarity of lowRarities) {
      it(`${rarity} + normal is standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "normal" }))).toBe(true);
      });
      it(`${rarity} + foil is NOT standard (foil is premium at low rarity)`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "foil" }))).toBe(false);
      });
    }
    for (const rarity of alwaysFoilRarities) {
      it(`${rarity} + normal is standard when the card has no foil version`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "normal" }))).toBe(true);
      });
      it(`${rarity} + foil is standard (foil is the plain version of always-foil rarities)`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "foil" }))).toBe(true);
      });
    }
    for (const finish of ["normal", "foil"]) {
      it(`showcase + ${finish} is NOT standard (a collector tier, never the plain version)`, () => {
        expect(isStandardPrinting(makePrinting({ rarity: "showcase", finish }))).toBe(false);
      });
    }
    for (const rarity of allRarities) {
      it(`${rarity} + metal is NOT standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "metal" }))).toBe(false);
      });
      it(`${rarity} + metal-deluxe is NOT standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "metal-deluxe" }))).toBe(false);
      });
    }
  });

  describe("the foil twin exception", () => {
    for (const rarity of alwaysFoilRarities) {
      it(`${rarity} + normal is NOT standard when a foil twin exists`, () => {
        expect(
          isStandardPrinting(makePrinting({ rarity, finish: "normal", hasFoilTwin: true })),
        ).toBe(false);
      });
      it(`${rarity} + foil stays standard even with the flag set`, () => {
        expect(
          isStandardPrinting(makePrinting({ rarity, finish: "foil", hasFoilTwin: true })),
        ).toBe(true);
      });
    }
    for (const rarity of lowRarities) {
      it(`${rarity} + normal stays standard when a foil twin exists`, () => {
        expect(
          isStandardPrinting(makePrinting({ rarity, finish: "normal", hasFoilTwin: true })),
        ).toBe(true);
      });
    }
  });

  it("an oversized printing is never standard", () => {
    expect(isStandardPrinting(makePrinting({ size: "oversized" }))).toBe(false);
  });

  it("a signed printing is never standard", () => {
    expect(isStandardPrinting(makePrinting({ isSigned: true }))).toBe(false);
  });

  it("a promo (marker present) printing is never standard", () => {
    expect(isStandardPrinting(makePrinting({ markers: [aMarker] }))).toBe(false);
  });

  it("a non-normal art variant is never standard", () => {
    expect(isStandardPrinting(makePrinting({ artVariant: "altart" }))).toBe(false);
    expect(isStandardPrinting(makePrinting({ artVariant: "ultimate" }))).toBe(false);
  });

  it("an overnumbered printing is never standard, whatever its art", () => {
    expect(isStandardPrinting(makePrinting({ isOvernumbered: true }))).toBe(false);
    expect(isStandardPrinting(makePrinting({ isOvernumbered: true, artVariant: "altart" }))).toBe(
      false,
    );
  });

  it("treats falsy art variant as normal", () => {
    expect(isStandardPrinting(makePrinting({ artVariant: "" }))).toBe(true);
  });

  it("rejects when several disqualifiers stack", () => {
    expect(
      isStandardPrinting(
        makePrinting({ rarity: "rare", finish: "foil", isSigned: true, markers: [aMarker] }),
      ),
    ).toBe(false);
  });
});

describe("findStandardArtFallback", () => {
  const frontImage = (imageId: string) => [{ face: "front" as const, imageId }];

  it("prefers the same-language standard printing over the EN one", () => {
    const target = makePrinting({ id: "p-target", language: "SC", artVariant: "altart" });
    const scStandard = makePrinting({
      id: "p-sc",
      language: "SC",
      canonicalRank: 5,
      images: frontImage("img-sc"),
    });
    const enStandard = makePrinting({
      id: "p-en",
      language: "EN",
      canonicalRank: 1,
      images: frontImage("img-en"),
    });
    const result = findStandardArtFallback(target, [target, enStandard, scStandard]);
    expect(result?.printing?.id).toBe("p-sc");
    expect(result?.image.imageId).toBe("img-sc");
  });

  it("falls back to the EN standard printing when the language has none with an image", () => {
    const target = makePrinting({ id: "p-target", language: "SC" });
    const scStandardNoImage = makePrinting({ id: "p-sc", language: "SC", images: [] });
    const enStandard = makePrinting({ id: "p-en", language: "EN", images: frontImage("img-en") });
    const result = findStandardArtFallback(target, [target, scStandardNoImage, enStandard]);
    expect(result?.printing?.id).toBe("p-en");
  });

  it("never returns the printing itself even when it already has an image", () => {
    const target = makePrinting({ id: "p-target", language: "EN", images: frontImage("img-a") });
    expect(findStandardArtFallback(target, [target])).toBeNull();
  });

  it("ignores non-standard candidates (alt art, markers, metal)", () => {
    const target = makePrinting({ id: "p-target", language: "EN" });
    const altArt = makePrinting({
      id: "p-alt",
      artVariant: "altart",
      images: frontImage("img-alt"),
    });
    const promo = makePrinting({ id: "p-promo", markers: [aMarker], images: frontImage("img-p") });
    const metal = makePrinting({ id: "p-metal", finish: "metal", images: frontImage("img-m") });
    expect(findStandardArtFallback(target, [target, altArt, promo, metal])).toBeNull();
  });

  it("skips standard printings whose image list lacks a front face", () => {
    const target = makePrinting({ id: "p-target", language: "EN" });
    const backOnly = makePrinting({
      id: "p-back",
      images: [{ face: "back", imageId: "img-back" }],
    });
    expect(findStandardArtFallback(target, [target, backOnly])).toBeNull();
  });

  it("picks the lowest canonicalRank among same-language standard candidates", () => {
    const target = makePrinting({ id: "p-target", language: "EN" });
    const reprint = makePrinting({
      id: "p-reprint",
      canonicalRank: 9,
      images: frontImage("img-r"),
    });
    const canonical = makePrinting({
      id: "p-canon",
      canonicalRank: 2,
      images: frontImage("img-c"),
    });
    const result = findStandardArtFallback(target, [target, reprint, canonical]);
    expect(result?.printing?.id).toBe("p-canon");
  });

  it("does not fall back across cards", () => {
    const target = makePrinting({ id: "p-target", cardId: "card-a", language: "EN" });
    const otherCard = makePrinting({
      id: "p-other",
      cardId: "card-b",
      images: frontImage("img-o"),
    });
    expect(findStandardArtFallback(target, [target, otherCard])).toBeNull();
  });

  it("returns null when there are no candidates at all", () => {
    expect(findStandardArtFallback(makePrinting({ id: "p-target" }), [])).toBeNull();
  });

  describe("admin override", () => {
    it("suppresses the substitute entirely in `none` mode", () => {
      const target = makePrinting({ id: "p-target", fallbackArtMode: "none" });
      const standard = makePrinting({ id: "p-std", images: frontImage("img-std") });
      expect(findStandardArtFallback(target, [target, standard])).toBeNull();
    });

    it("shows the pinned image instead of the standard printing's", () => {
      const target = makePrinting({
        id: "p-target",
        artVariant: "altart",
        fallbackArtMode: "pinned",
        fallbackImageId: "img-pinned",
      });
      const standard = makePrinting({ id: "p-std", images: frontImage("img-std") });
      const result = findStandardArtFallback(target, [target, standard]);
      expect(result?.image.imageId).toBe("img-pinned");
    });

    it("names the sibling printing a pinned image came from", () => {
      const target = makePrinting({
        id: "p-target",
        fallbackArtMode: "pinned",
        fallbackImageId: "img-alt",
      });
      const altArt = makePrinting({
        id: "p-alt",
        artVariant: "altart",
        images: frontImage("img-alt"),
      });
      const result = findStandardArtFallback(target, [target, altArt]);
      expect(result?.printing?.id).toBe("p-alt");
      expect(result?.image.imageId).toBe("img-alt");
    });

    it("resolves a pin to a null printing when no sibling carries that image", () => {
      const target = makePrinting({
        id: "p-target",
        fallbackArtMode: "pinned",
        fallbackImageId: "img-uploaded",
      });
      const standard = makePrinting({ id: "p-std", images: frontImage("img-std") });
      const result = findStandardArtFallback(target, [target, standard]);
      expect(result?.printing).toBeNull();
      expect(result?.image).toEqual({ face: "front", imageId: "img-uploaded" });
    });

    it("shows a pinned back-face scan in the front slot", () => {
      const target = makePrinting({
        id: "p-target",
        fallbackArtMode: "pinned",
        fallbackImageId: "img-back",
      });
      const backOnly = makePrinting({
        id: "p-back",
        images: [{ face: "back", imageId: "img-back" }],
      });
      const result = findStandardArtFallback(target, [target, backOnly]);
      expect(result?.image.face).toBe("front");
      expect(result?.printing?.id).toBe("p-back");
    });

    it("derives as usual when a pin arrives without a servable image", () => {
      const target = makePrinting({ id: "p-target", fallbackArtMode: "pinned" });
      const standard = makePrinting({ id: "p-std", images: frontImage("img-std") });
      const result = findStandardArtFallback(target, [target, standard]);
      expect(result?.printing?.id).toBe("p-std");
    });
  });
});
