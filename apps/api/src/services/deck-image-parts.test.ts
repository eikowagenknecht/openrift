import { describe, expect, it } from "vitest";

import type { DeckImageCard } from "./deck-image-parts.js";
import { deckMetaLabel, packGrid, runeCountsByDomain, splitDeckZones } from "./deck-image-parts.js";

/** Portrait card aspect, mirrored from share-image-core. */
const CARD_ASPECT = 0.715;

function card(
  cardName: string,
  zone: string,
  quantity = 1,
  energy: number | null = null,
  domains: string[] = [],
): DeckImageCard {
  return { cardName, zone, quantity, energy, domains, imageId: null };
}

describe("splitDeckZones", () => {
  it("groups a deck into the bands a layout draws", () => {
    const zones = splitDeckZones([
      card("Scorn of the Moon", "legend"),
      card("Order Rune", "runes", 6, null, ["order"]),
      card("Targon's Peak", "battlefield"),
      card("Diana", "champion", 3, 3),
      card("Gust", "main", 3, 1),
      card("Singularity", "sideboard", 2, 6),
    ]);
    expect(zones.legend?.cardName).toBe("Scorn of the Moon");
    expect(zones.battlefields).toHaveLength(1);
    expect(zones.sideboard).toHaveLength(1);
    expect(zones.gridCards.map((entry) => entry.cardName)).toEqual(["Diana", "Gust"]);
  });

  it("leads the grid with champions, then sorts the rest by cost", () => {
    const zones = splitDeckZones([
      card("Cheap spell", "main", 1, 1),
      card("Expensive spell", "main", 1, 8),
      card("Late champion", "champion", 1, 6),
    ]);
    // The champion comes first despite costing more than either spell.
    expect(zones.gridCards.map((entry) => entry.cardName)).toEqual([
      "Late champion",
      "Cheap spell",
      "Expensive spell",
    ]);
  });

  it("sorts equal-cost cards by name and puts null energy last", () => {
    const zones = splitDeckZones([
      card("Zed", "main", 1, 2),
      card("Ahri", "main", 1, 2),
      card("Unknown cost", "main", 1, null),
    ]);
    expect(zones.gridCards.map((entry) => entry.cardName)).toEqual(["Ahri", "Zed", "Unknown cost"]);
  });

  it("counts champions and main but not overflow, legend, runes, or battlefields", () => {
    const zones = splitDeckZones([
      card("Scorn of the Moon", "legend"),
      card("Order Rune", "runes", 6),
      card("Targon's Peak", "battlefield"),
      card("Diana", "champion", 3, 3),
      card("Gust", "main", 3, 1),
      card("Spare copy", "overflow", 2, 1),
      card("Singularity", "sideboard", 2, 6),
    ]);
    expect(zones.mainCardCount).toBe(6);
    expect(zones.sideboardCount).toBe(2);
    // The overflow copies still show in the grid, they are just not counted.
    expect(zones.gridCards).toHaveLength(3);
  });

  it("caps the battlefields it shows", () => {
    const zones = splitDeckZones(
      Array.from({ length: 6 }, (_, index) => card(`Field ${index}`, "battlefield")),
    );
    expect(zones.battlefields).toHaveLength(3);
  });

  it("orders rune cards by copies held, then name", () => {
    const zones = splitDeckZones([
      card("Fury Rune", "runes", 2, null, ["fury"]),
      card("Order Rune", "runes", 6, null, ["order"]),
      card("Calm Rune", "runes", 2, null, ["calm"]),
    ]);
    expect(zones.runeCards.map((entry) => entry.cardName)).toEqual([
      "Order Rune",
      "Calm Rune",
      "Fury Rune",
    ]);
  });

  it("handles an empty deck", () => {
    const zones = splitDeckZones([]);
    expect(zones.legend).toBeNull();
    expect(zones.gridCards).toEqual([]);
    expect(zones.mainCardCount).toBe(0);
  });
});

describe("runeCountsByDomain", () => {
  it("sums copies per domain, highest first", () => {
    const counts = runeCountsByDomain([
      card("Fury Rune", "runes", 2, null, ["fury"]),
      card("Order Rune", "runes", 6, null, ["order"]),
      card("Order Rune", "runes", 1, null, ["order"]),
    ]);
    expect(counts).toEqual([
      { domain: "order", count: 7 },
      { domain: "fury", count: 2 },
    ]);
  });

  it("folds a multi-domain rune into rainbow", () => {
    const counts = runeCountsByDomain([card("Prism Rune", "runes", 3, null, ["fury", "order"])]);
    expect(counts).toEqual([{ domain: "rainbow", count: 3 }]);
  });

  it("treats a domainless rune as rainbow rather than dropping it", () => {
    const counts = runeCountsByDomain([card("Blank Rune", "runes", 1)]);
    expect(counts).toEqual([{ domain: "rainbow", count: 1 }]);
  });
});

describe("deckMetaLabel", () => {
  it("omits the sideboard when there is none", () => {
    expect(deckMetaLabel("Constructed", 40, 0)).toBe("Constructed · 40 cards");
  });

  it("reports the sideboard separately", () => {
    expect(deckMetaLabel("Constructed", 40, 4)).toBe("Constructed · 40 + 4 cards");
  });

  it("uses the singular for a one-card deck", () => {
    expect(deckMetaLabel("Freeform", 1, 0)).toBe("Freeform · 1 card");
  });
});

describe("packGrid", () => {
  it("picks the column count that makes tiles largest", () => {
    const grid = packGrid(15, 1024, 980, CARD_ASPECT);
    expect(grid.cols).toBeGreaterThan(1);
    expect(grid.tileW).toBe(Math.floor(grid.tileH * CARD_ASPECT));
    // Every tile has to fit the area it was measured against.
    const rows = Math.ceil(15 / grid.cols);
    expect(grid.cols * grid.tileW + (grid.cols - 1) * 10).toBeLessThanOrEqual(1024);
    expect(rows * grid.tileH + (rows - 1) * 10).toBeLessThanOrEqual(980);
  });

  it("stacks a two-card deck into one column on a tall area by default", () => {
    // One column of two tiles beats two columns of one by a single pixel here,
    // which is what `preferWider` exists to overrule.
    expect(packGrid(2, 1024, 1431, CARD_ASPECT).cols).toBe(1);
  });

  it("breaks that near-tie toward more columns when asked", () => {
    expect(packGrid(2, 1024, 1431, CARD_ASPECT, { preferWider: true }).cols).toBe(2);
  });

  it("does not let preferWider override a genuinely larger tile", () => {
    const plain = packGrid(15, 1024, 980, CARD_ASPECT);
    const wider = packGrid(15, 1024, 980, CARD_ASPECT, { preferWider: true });
    expect(wider.cols).toBe(plain.cols);
  });

  it("caps the tile width without changing the column count", () => {
    const uncapped = packGrid(2, 1024, 1431, CARD_ASPECT, { preferWider: true });
    const capped = packGrid(2, 1024, 1431, CARD_ASPECT, { preferWider: true, maxTileW: 300 });
    expect(capped.cols).toBe(uncapped.cols);
    expect(capped.tileW).toBe(300);
    expect(capped.tileH).toBe(Math.floor(300 / CARD_ASPECT));
  });

  it("leaves a tile already under the cap alone", () => {
    const capped = packGrid(15, 1024, 980, CARD_ASPECT, { maxTileW: 300 });
    expect(capped.tileW).toBeLessThan(300);
  });
});
