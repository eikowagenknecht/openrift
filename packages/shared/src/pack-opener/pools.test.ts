import { describe, expect, it } from "bun:test";

import { buildPool } from "./pools";
import type { PackPrinting } from "./types";

function printing(overrides: Partial<PackPrinting>): PackPrinting {
  return {
    id: "p",
    cardId: "c",
    cardName: "Card",
    cardSlug: "card",
    cardType: "unit",
    cardSuperTypes: [],
    rarity: "common",
    finish: "normal",
    artVariant: "normal",
    isSigned: false,
    language: "EN",
    shortCode: "XXX-001",
    publicCode: "XXX-001",
    setSlug: "OGN",
    ...overrides,
  };
}

describe("buildPool", () => {
  it("buckets each printing into exactly one slot pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "c1", rarity: "common" }),
      printing({ id: "u1", rarity: "uncommon" }),
      printing({ id: "fc1", rarity: "common", finish: "foil" }),
      printing({ id: "fu1", rarity: "uncommon", finish: "foil" }),
      printing({ id: "r1", rarity: "rare", finish: "foil" }),
      printing({ id: "e1", rarity: "epic", finish: "foil" }),
      printing({ id: "run1", cardType: "rune", rarity: "common" }),
      printing({ id: "frun1", cardType: "rune", rarity: "common", finish: "foil" }),
      printing({ id: "arun1", cardType: "rune", rarity: "common", artVariant: "altart" }),
      printing({ id: "tok1", cardSuperTypes: ["token"] }),
      printing({ id: "sa1", rarity: "showcase", finish: "foil", artVariant: "altart" }),
      printing({ id: "so1", rarity: "showcase", finish: "foil", artVariant: "overnumbered" }),
      printing({ id: "ss1", rarity: "showcase", finish: "foil", isSigned: true }),
      printing({ id: "ult1", artVariant: "ultimate" }),
    ];
    const pool = buildPool(printings);
    expect(pool.commons.map((p) => p.id)).toEqual(["c1"]);
    expect(pool.uncommons.map((p) => p.id)).toEqual(["u1"]);
    expect(pool.foilCommons.map((p) => p.id)).toEqual(["fc1"]);
    expect(pool.foilUncommons.map((p) => p.id)).toEqual(["fu1"]);
    expect(pool.rares.map((p) => p.id)).toEqual(["r1"]);
    expect(pool.epics.map((p) => p.id)).toEqual(["e1"]);
    expect(pool.runes.map((p) => p.id)).toEqual(["run1"]);
    expect(pool.foilRunes.map((p) => p.id)).toEqual(["frun1"]);
    expect(pool.altArtRunes.map((p) => p.id)).toEqual(["arun1"]);
    expect(pool.tokens.map((p) => p.id)).toEqual(["tok1"]);
    expect(pool.showcaseAltart.map((p) => p.id)).toEqual(["sa1"]);
    expect(pool.showcaseOvernumbered.map((p) => p.id)).toEqual(["so1"]);
    expect(pool.showcaseSigned.map((p) => p.id)).toEqual(["ss1"]);
    expect(pool.ultimates.map((p) => p.id)).toEqual(["ult1"]);
  });

  it("excludes metal finishes and signed non-Showcase cards from the flex pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "metal", rarity: "rare", finish: "metal" }),
      printing({ id: "metaldlx", rarity: "rare", finish: "metal-deluxe" }),
      printing({ id: "signedEpic", rarity: "epic", finish: "foil", isSigned: true }),
    ];
    const pool = buildPool(printings);
    expect(pool.rares).toHaveLength(0);
    expect(pool.epics).toHaveLength(0);
  });

  it("keeps Common Runes out of the common pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "c", rarity: "common" }),
      printing({ id: "rune", cardType: "rune", rarity: "common" }),
    ];
    const pool = buildPool(printings);
    expect(pool.commons.map((p) => p.id)).toEqual(["c"]);
    expect(pool.runes.map((p) => p.id)).toEqual(["rune"]);
  });

  it("keeps Token-supertype cards out of the common pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "c", rarity: "common" }),
      // Sprite/Recruit are Common-rarity Unit cards with the Token super type.
      printing({ id: "sprite", cardType: "unit", cardSuperTypes: ["token"], rarity: "common" }),
    ];
    const pool = buildPool(printings);
    expect(pool.commons.map((p) => p.id)).toEqual(["c"]);
    expect(pool.tokens.map((p) => p.id)).toEqual(["sprite"]);
  });

  it("routes ultimate printings to the ultimates pool regardless of rarity", () => {
    const pool = buildPool([
      printing({ id: "u", rarity: "showcase", artVariant: "ultimate", finish: "foil" }),
    ]);
    expect(pool.ultimates).toHaveLength(1);
    expect(pool.showcaseAltart).toHaveLength(0);
    expect(pool.showcaseOvernumbered).toHaveLength(0);
  });
});
