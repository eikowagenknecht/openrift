import { describe, expect, it } from "vitest";

import {
  decodeMetaDeckCardIndex,
  isMostlyBuildable,
  metaDeckOwnership,
  metaDeckOwnershipByDeck,
  mostlyBuildableDeckIds,
  ownedCountsByCardId,
} from "./meta-deck-collection";

describe("decodeMetaDeckCardIndex", () => {
  it("turns pooled positions back into card ids", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a", "card-b"],
      decks: [
        { deckId: "deck-1", entries: [0, 3, 1, 1] },
        { deckId: "deck-2", entries: [1, 2] },
      ],
    });
    expect([...(decoded.get("deck-1") ?? [])]).toEqual([
      ["card-a", 3],
      ["card-b", 1],
    ]);
    expect([...(decoded.get("deck-2") ?? [])]).toEqual([["card-b", 2]]);
  });

  it("drops a pair naming a card outside the pool", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a"],
      decks: [{ deckId: "deck-1", entries: [0, 2, 7, 1] }],
    });
    expect([...(decoded.get("deck-1") ?? [])]).toEqual([["card-a", 2]]);
  });

  it("drops a trailing index with no quantity behind it", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a", "card-b"],
      decks: [{ deckId: "deck-1", entries: [0, 2, 1] }],
    });
    expect([...(decoded.get("deck-1") ?? [])]).toEqual([["card-a", 2]]);
  });

  it("keeps a deck the archive holds no cards of", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: [],
      decks: [{ deckId: "deck-1", entries: [] }],
    });
    expect(decoded.get("deck-1")?.size).toBe(0);
  });

  it("returns an empty map for an empty index", () => {
    expect(decodeMetaDeckCardIndex({ cards: [], decks: [] }).size).toBe(0);
  });
});

describe("ownedCountsByCardId", () => {
  const printings = new Map([
    ["card-a", [{ id: "print-a1" }, { id: "print-a2" }]],
    ["card-b", [{ id: "print-b1" }]],
  ]);

  it("sums a card's copies across its printings", () => {
    const owned = ownedCountsByCardId({ "print-a1": 2, "print-a2": 1 }, printings);
    expect(owned.get("card-a")).toBe(3);
  });

  it("leaves out a card the reader owns none of", () => {
    const owned = ownedCountsByCardId({ "print-a1": 1 }, printings);
    expect(owned.has("card-b")).toBe(false);
  });

  it("ignores a printing outside the catalog", () => {
    const owned = ownedCountsByCardId({ "print-unknown": 5 }, printings);
    expect(owned.size).toBe(0);
  });
});

describe("metaDeckOwnership", () => {
  const requirements = new Map([
    ["card-a", 3],
    ["card-b", 1],
  ]);

  it("counts the copies the list calls for", () => {
    expect(metaDeckOwnership(requirements, new Map())).toEqual({ owned: 0, needed: 4 });
  });

  it("caps a card's contribution at what the list plays", () => {
    const owned = new Map([["card-a", 9]]);
    expect(metaDeckOwnership(requirements, owned)).toEqual({ owned: 3, needed: 4 });
  });

  it("counts a fully owned list as complete", () => {
    const owned = new Map([
      ["card-a", 3],
      ["card-b", 1],
    ]);
    expect(metaDeckOwnership(requirements, owned)).toEqual({ owned: 4, needed: 4 });
  });

  it("needs nothing for a list the archive holds no cards of", () => {
    expect(metaDeckOwnership(new Map(), new Map())).toEqual({ owned: 0, needed: 0 });
  });
});

describe("isMostlyBuildable", () => {
  it("is true at the threshold", () => {
    expect(isMostlyBuildable({ owned: 8, needed: 10 })).toBe(true);
  });

  it("is false just under it", () => {
    expect(isMostlyBuildable({ owned: 7, needed: 10 })).toBe(false);
  });

  it("is false for a list with nothing known in it", () => {
    expect(isMostlyBuildable({ owned: 0, needed: 0 })).toBe(false);
  });
});

describe("metaDeckOwnershipByDeck", () => {
  it("judges each deck against the same collection", () => {
    const byDeck = metaDeckOwnershipByDeck(
      new Map([
        ["deck-1", new Map([["card-a", 2]])],
        ["deck-2", new Map([["card-b", 2]])],
      ]),
      new Map([["card-a", 2]]),
    );
    expect(byDeck.get("deck-1")).toEqual({ owned: 2, needed: 2 });
    expect(byDeck.get("deck-2")).toEqual({ owned: 0, needed: 2 });
  });
});

describe("mostlyBuildableDeckIds", () => {
  it("keeps only the decks over the threshold", () => {
    const ids = mostlyBuildableDeckIds(
      new Map([
        ["deck-1", { owned: 10, needed: 10 }],
        ["deck-2", { owned: 1, needed: 10 }],
      ]),
    );
    expect([...ids]).toEqual(["deck-1"]);
  });

  it("is empty when nothing qualifies", () => {
    expect(mostlyBuildableDeckIds(new Map()).size).toBe(0);
  });
});
