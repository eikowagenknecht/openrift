import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckDiffCard } from "./deck-diff";
import { alignDeckLists } from "./deck-side-by-side";

const MAIN = WellKnown.deckZone.MAIN;
const SIDEBOARD = WellKnown.deckZone.SIDEBOARD;

function card(overrides: Partial<DeckDiffCard> & { cardId: string }): DeckDiffCard {
  return {
    cardName: overrides.cardId,
    zone: MAIN,
    quantity: 1,
    ...overrides,
  };
}

describe("alignDeckLists", () => {
  it("returns no zones for two empty lists", () => {
    expect(alignDeckLists([], [])).toEqual([]);
  });

  it("marks a card both sides hold at the same count as unchanged", () => {
    const zones = alignDeckLists(
      [card({ cardId: "a", quantity: 3 })],
      [card({ cardId: "a", quantity: 3 })],
    );
    expect(zones).toHaveLength(1);
    expect(zones[0]?.rows).toEqual([{ cardId: "a", cardName: "a", from: 3, to: 3, kind: "same" }]);
  });

  it("classifies adds, cuts, and count changes", () => {
    const zones = alignDeckLists(
      [card({ cardId: "cut", quantity: 2 }), card({ cardId: "changed", quantity: 1 })],
      [card({ cardId: "changed", quantity: 3 }), card({ cardId: "added", quantity: 2 })],
    );
    const rows = zones[0]?.rows ?? [];
    expect(rows.map((row) => [row.cardId, row.kind])).toEqual([
      ["added", "add"],
      ["changed", "change"],
      ["cut", "cut"],
    ]);
    expect(rows.find((row) => row.cardId === "cut")).toMatchObject({ from: 2, to: 0 });
    expect(rows.find((row) => row.cardId === "added")).toMatchObject({ from: 0, to: 2 });
  });

  it("sums copies of a card pinned to several printings", () => {
    const zones = alignDeckLists(
      [card({ cardId: "a", quantity: 1 }), card({ cardId: "a", quantity: 2 })],
      [card({ cardId: "a", quantity: 3 })],
    );
    expect(zones[0]?.rows).toEqual([{ cardId: "a", cardName: "a", from: 3, to: 3, kind: "same" }]);
  });

  it("keeps a card that moved zones as a cut and an add", () => {
    const zones = alignDeckLists(
      [card({ cardId: "a", quantity: 2 })],
      [card({ cardId: "a", quantity: 2, zone: SIDEBOARD })],
    );
    expect(zones.map((zone) => zone.zone)).toEqual([MAIN, SIDEBOARD]);
    expect(zones[0]?.rows[0]?.kind).toBe("cut");
    expect(zones[1]?.rows[0]?.kind).toBe("add");
  });

  it("totals each zone per side", () => {
    const zones = alignDeckLists(
      [card({ cardId: "a", quantity: 2 }), card({ cardId: "b", quantity: 1 })],
      [card({ cardId: "a", quantity: 3 })],
    );
    expect(zones[0]).toMatchObject({ fromCount: 3, toCount: 3 });
  });

  it("orders rows by card name", () => {
    const zones = alignDeckLists(
      [],
      [
        card({ cardId: "z", cardName: "Zed" }),
        card({ cardId: "a", cardName: "Annie" }),
        card({ cardId: "m", cardName: "Malphite" }),
      ],
    );
    expect(zones[0]?.rows.map((row) => row.cardName)).toEqual(["Annie", "Malphite", "Zed"]);
  });
});
