import { describe, expect, it } from "bun:test";

import { buildPool } from "./pools";
import type { PackPrinting } from "./types";

function printing(overrides: Partial<PackPrinting>): PackPrinting {
  return {
    id: "p",
    cardId: "c",
    cardName: "Card",
    cardSlug: "card",
    cardType: "Unit",
    rarity: "Common",
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
      printing({ id: "c1", rarity: "Common" }),
      printing({ id: "u1", rarity: "Uncommon" }),
      printing({ id: "fc1", rarity: "Common", finish: "foil" }),
      printing({ id: "fu1", rarity: "Uncommon", finish: "foil" }),
      printing({ id: "r1", rarity: "Rare", finish: "foil" }),
      printing({ id: "e1", rarity: "Epic", finish: "foil" }),
      printing({ id: "run1", cardType: "Rune", rarity: "Common" }),
      printing({ id: "sa1", rarity: "Showcase", finish: "foil", artVariant: "altart" }),
      printing({ id: "so1", rarity: "Showcase", finish: "foil", artVariant: "overnumbered" }),
      printing({ id: "ss1", rarity: "Showcase", finish: "foil", isSigned: true }),
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
    expect(pool.showcaseAltart.map((p) => p.id)).toEqual(["sa1"]);
    expect(pool.showcaseOvernumbered.map((p) => p.id)).toEqual(["so1"]);
    expect(pool.showcaseSigned.map((p) => p.id)).toEqual(["ss1"]);
    expect(pool.ultimates.map((p) => p.id)).toEqual(["ult1"]);
  });

  it("excludes metal finishes and signed non-Showcase cards from the flex pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "metal", rarity: "Rare", finish: "metal" }),
      printing({ id: "metaldlx", rarity: "Rare", finish: "metal-deluxe" }),
      printing({ id: "signedEpic", rarity: "Epic", finish: "foil", isSigned: true }),
    ];
    const pool = buildPool(printings);
    expect(pool.rares).toHaveLength(0);
    expect(pool.epics).toHaveLength(0);
  });

  it("keeps Common Runes out of the common pool", () => {
    const printings: PackPrinting[] = [
      printing({ id: "c", rarity: "Common" }),
      printing({ id: "rune", cardType: "Rune", rarity: "Common" }),
    ];
    const pool = buildPool(printings);
    expect(pool.commons.map((p) => p.id)).toEqual(["c"]);
    expect(pool.runes.map((p) => p.id)).toEqual(["rune"]);
  });

  it("routes ultimate printings to the ultimates pool regardless of rarity", () => {
    const pool = buildPool([
      printing({ id: "u", rarity: "Showcase", artVariant: "ultimate", finish: "foil" }),
    ]);
    expect(pool.ultimates).toHaveLength(1);
    expect(pool.showcaseAltart).toHaveLength(0);
    expect(pool.showcaseOvernumbered).toHaveLength(0);
  });
});
