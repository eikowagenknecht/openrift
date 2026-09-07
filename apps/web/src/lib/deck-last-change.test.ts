import type { DeckZone } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { lastChange } from "@/lib/deck-last-change";
import { stubDeckBuilderCard } from "@/test/factories";

const card = (
  cardId: string,
  quantity: number,
  zone = "main",
  cardName = cardId,
): DeckBuilderCard => stubDeckBuilderCard({ cardId, cardName, quantity, zone: zone as DeckZone });

describe("lastChange", () => {
  it("names a card that was added", () => {
    const previous = [card("broker", 1, "main", "Honest Broker")];
    const current = [card("broker", 3, "main", "Honest Broker")];

    expect(lastChange(previous, current)).toEqual({ cardName: "Honest Broker", delta: 2 });
  });

  it("names a card that was removed, using its old name", () => {
    const previous = [card("vanguard", 2, "main", "Stalwart Vanguard")];

    expect(lastChange(previous, [])).toEqual({ cardName: "Stalwart Vanguard", delta: -2 });
  });

  it("reports a card appearing from nothing", () => {
    expect(lastChange([], [card("new", 1, "main", "New Card")])).toEqual({
      cardName: "New Card",
      delta: 1,
    });
  });

  it("reports a quantity change on an existing card", () => {
    expect(lastChange([card("a", 3)], [card("a", 2)])).toEqual({ cardName: "a", delta: -1 });
  });

  it("returns null when the decks hold the same copies", () => {
    const cards = [card("a", 2), card("b", 1)];

    expect(lastChange(cards, [...cards])).toBeNull();
    expect(lastChange([], [])).toBeNull();
  });

  it("ignores a zone move, since the total is unchanged", () => {
    const previous = [card("a", 2, "sideboard")];
    const current = [card("a", 2, "main")];

    expect(lastChange(previous, current)).toBeNull();
  });

  it("sums a card split across zones before comparing", () => {
    const previous = [card("a", 2, "main"), card("a", 1, "sideboard")];
    const current = [card("a", 2, "main")];

    expect(lastChange(previous, current)).toEqual({ cardName: "a", delta: -1 });
  });

  it("picks the largest swing when several cards changed", () => {
    const previous = [card("a", 1), card("b", 4)];
    const current = [card("a", 2), card("b", 1)];

    expect(lastChange(previous, current)).toEqual({ cardName: "b", delta: -3 });
  });

  it("breaks a tie by name so the result is stable", () => {
    const previous = [card("zeta", 1, "main", "Zeta"), card("alpha", 1, "main", "Alpha")];
    const current = [card("zeta", 2, "main", "Zeta"), card("alpha", 2, "main", "Alpha")];

    expect(lastChange(previous, current)).toEqual({ cardName: "Alpha", delta: 1 });
    expect(lastChange([...previous].toReversed(), [...current].toReversed())).toEqual({
      cardName: "Alpha",
      delta: 1,
    });
  });

  it("handles a legend switch as one drop and one add", () => {
    const previous = [card("old-legend", 1, "legend", "Old Legend")];
    const current = [card("new-legend", 1, "legend", "New Legend")];

    expect(lastChange(previous, current)).toEqual({ cardName: "New Legend", delta: 1 });
  });

  it("does not mutate its inputs", () => {
    const previous = [card("a", 2)];
    const current = [card("a", 5)];
    const snapshot = structuredClone(previous);

    lastChange(previous, current);

    expect(previous).toEqual(snapshot);
  });
});
