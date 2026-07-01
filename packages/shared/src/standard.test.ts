import { describe, expect, it } from "vitest";

import { isStandardPrinting } from "./standard.js";
import type { Marker, Printing } from "./types/index.js";

function makePrinting(overrides: Partial<Printing> = {}): Printing {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    setSlug: "set-alpha",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Jane Doe",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: "SET1-001",
      name: "Test Card",
      type: "unit",
      superTypes: [],
      domains: ["fury"],
      energy: 3,
      might: 2,
      power: 4,
      keywords: [],
      tags: [],
      mightBonus: 0,
      errata: null,
      bans: [],
    },
    ...overrides,
  };
}

const aMarker: Marker = { id: "m1", slug: "stamp", label: "Stamp", description: null };

describe("isStandardPrinting", () => {
  const lowRarities = ["common", "uncommon"];
  const highRarities = ["rare", "epic", "showcase"];

  describe("finish × rarity matrix (normal art, unsigned, no markers)", () => {
    for (const rarity of lowRarities) {
      it(`${rarity} + normal is standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "normal" }))).toBe(true);
      });
      it(`${rarity} + foil is NOT standard (foil is premium at low rarity)`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "foil" }))).toBe(false);
      });
    }
    for (const rarity of highRarities) {
      it(`${rarity} + normal is standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "normal" }))).toBe(true);
      });
      it(`${rarity} + foil is standard (foil is the plain version of always-foil rarities)`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "foil" }))).toBe(true);
      });
    }
    for (const rarity of [...lowRarities, ...highRarities]) {
      it(`${rarity} + metal is NOT standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "metal" }))).toBe(false);
      });
      it(`${rarity} + metal-deluxe is NOT standard`, () => {
        expect(isStandardPrinting(makePrinting({ rarity, finish: "metal-deluxe" }))).toBe(false);
      });
    }
  });

  it("a signed printing is never standard", () => {
    expect(isStandardPrinting(makePrinting({ isSigned: true }))).toBe(false);
  });

  it("a promo (marker present) printing is never standard", () => {
    expect(isStandardPrinting(makePrinting({ markers: [aMarker] }))).toBe(false);
  });

  it("a non-normal art variant is never standard", () => {
    expect(isStandardPrinting(makePrinting({ artVariant: "altart" }))).toBe(false);
    expect(isStandardPrinting(makePrinting({ artVariant: "overnumbered" }))).toBe(false);
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
