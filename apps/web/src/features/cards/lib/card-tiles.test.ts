import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import {
  cardsViewTileKey,
  dedupeToCardsViewTiles,
  splitsCardIntoTiles,
  tileSiblings,
} from "./card-tiles";

beforeEach(() => {
  resetIdCounter();
});

describe("splitsCardIntoTiles", () => {
  it("is true for the per-printing axes", () => {
    expect(splitsCardIntoTiles("set")).toBe(true);
    expect(splitsCardIntoTiles("rarity")).toBe(true);
  });

  it("is false for card-level axes", () => {
    expect(splitsCardIntoTiles("none")).toBe(false);
    expect(splitsCardIntoTiles("type")).toBe(false);
    expect(splitsCardIntoTiles("domain")).toBe(false);
    expect(splitsCardIntoTiles("superType")).toBe(false);
  });
});

describe("cardsViewTileKey", () => {
  it("keys on cardId alone for card-level axes", () => {
    const printing = stubPrinting({ cardId: "card-1", setId: "set-ogn", rarity: "rare" });
    expect(cardsViewTileKey(printing, "none")).toBe("card-1");
    expect(cardsViewTileKey(printing, "type")).toBe("card-1");
    expect(cardsViewTileKey(printing, "domain")).toBe("card-1");
  });

  it("splits on set when grouping by set", () => {
    const printing = stubPrinting({ cardId: "card-1", setId: "set-ogn", rarity: "rare" });
    expect(cardsViewTileKey(printing, "set")).toBe("card-1|set-ogn");
  });

  it("splits on rarity when grouping by rarity", () => {
    const printing = stubPrinting({ cardId: "card-1", setId: "set-ogn", rarity: "rare" });
    expect(cardsViewTileKey(printing, "rarity")).toBe("card-1|rare");
  });
});

describe("dedupeToCardsViewTiles", () => {
  it("keeps one printing per card for card-level axes", () => {
    const a = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const b = stubPrinting({ cardId: "card-1", setId: "set-unl" });
    const result = dedupeToCardsViewTiles([a, b], "none");
    expect(result.map((p) => p.id)).toEqual([a.id]);
  });

  it("keeps one printing per (card, set) when grouping by set", () => {
    const ognA = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const ognB = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const unl = stubPrinting({ cardId: "card-1", setId: "set-unl" });
    const result = dedupeToCardsViewTiles([ognA, ognB, unl], "set");
    expect(result.map((p) => p.id)).toEqual([ognA.id, unl.id]);
  });

  it("keeps one printing per (card, rarity) when grouping by rarity", () => {
    const common = stubPrinting({ cardId: "card-1", rarity: "common" });
    const rareA = stubPrinting({ cardId: "card-1", rarity: "rare" });
    const rareB = stubPrinting({ cardId: "card-1", rarity: "rare" });
    const result = dedupeToCardsViewTiles([common, rareA, rareB], "rarity");
    expect(result.map((p) => p.id)).toEqual([common.id, rareA.id]);
  });

  it("preserves first-occurrence order", () => {
    const unl = stubPrinting({ cardId: "card-1", setId: "set-unl" });
    const ogn = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const result = dedupeToCardsViewTiles([unl, ogn], "set");
    expect(result.map((p) => p.id)).toEqual([unl.id, ogn.id]);
  });
});

describe("tileSiblings", () => {
  it("returns all siblings unchanged for card-level axes", () => {
    const rep = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const other = stubPrinting({ cardId: "card-1", setId: "set-unl" });
    const siblings = [rep, other];
    expect(tileSiblings(rep, siblings, "none")).toBe(siblings);
  });

  it("narrows to the representative's set when grouping by set", () => {
    const ogn = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const ognAlt = stubPrinting({ cardId: "card-1", setId: "set-ogn" });
    const unl = stubPrinting({ cardId: "card-1", setId: "set-unl" });
    expect(tileSiblings(ogn, [ogn, ognAlt, unl], "set")?.map((p) => p.id)).toEqual([
      ogn.id,
      ognAlt.id,
    ]);
  });

  it("narrows to the representative's rarity when grouping by rarity", () => {
    const common = stubPrinting({ cardId: "card-1", rarity: "common" });
    const rare = stubPrinting({ cardId: "card-1", rarity: "rare" });
    expect(tileSiblings(rare, [common, rare], "rarity")?.map((p) => p.id)).toEqual([rare.id]);
  });

  it("passes undefined through", () => {
    const rep = stubPrinting({ cardId: "card-1" });
    expect(tileSiblings(rep, undefined, "set")).toBeUndefined();
  });
});
