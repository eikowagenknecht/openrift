import { WellKnown } from "@openrift/shared/well-known";
import { beforeEach, describe, expect, it } from "vitest";

import { getDeckCardKey } from "@/lib/deck-builder-card";
import { buildAddRoom, expandCopies, zoneShowsAllCopies } from "@/lib/deck-overview-derive";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

beforeEach(() => {
  resetIdCounter();
});

describe("buildAddRoom", () => {
  it("returns an empty map for an empty deck", () => {
    expect(buildAddRoom([], WellKnown.deckFormat.CONSTRUCTED).size).toBe(0);
  });

  it("leaves room up to the three-copy cap in the main deck", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, quantity: 1 });
    const room = buildAddRoom([card], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(card))).toBe(2);
  });

  it("closes the entry once the copy cap is reached", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, quantity: 3 });
    const room = buildAddRoom([card], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(card))).toBe(0);
  });

  it("counts copies of the same card across the capped zones", () => {
    const main = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, quantity: 2 });
    const sideboard = stubDeckBuilderCard({
      cardId: main.cardId,
      zone: WellKnown.deckZone.SIDEBOARD,
      quantity: 1,
    });
    const room = buildAddRoom([main, sideboard], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(main))).toBe(0);
    expect(room.get(getDeckCardKey(sideboard))).toBe(0);
  });

  it("leaves overflow uncapped", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.OVERFLOW, quantity: 9 });
    const room = buildAddRoom([card], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(card))).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves the zones without a stepper uncapped", () => {
    const legend = stubDeckBuilderCard({ zone: WellKnown.deckZone.LEGEND, cardType: "legend" });
    const room = buildAddRoom([legend], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(legend))).toBe(Number.POSITIVE_INFINITY);
  });

  it("opens every zone in freeform, which validates nothing", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, quantity: 3 });
    const room = buildAddRoom([card], WellKnown.deckFormat.FREEFORM);
    expect(room.get(getDeckCardKey(card))).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves runes room up to the twelve-rune target", () => {
    const rune = stubDeckBuilderCard({
      zone: WellKnown.deckZone.RUNES,
      cardType: "rune",
      quantity: 5,
    });
    const room = buildAddRoom([rune], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(rune))).toBe(7);
  });

  it("closes runes at the target when no swap is available", () => {
    const rune = stubDeckBuilderCard({
      zone: WellKnown.deckZone.RUNES,
      cardType: "rune",
      quantity: 12,
    });
    const room = buildAddRoom([rune], WellKnown.deckFormat.CONSTRUCTED);
    expect(room.get(getDeckCardKey(rune))).toBe(0);
  });
});

describe("expandCopies", () => {
  it("returns nothing for an empty zone", () => {
    expect(expandCopies([], true)).toEqual([]);
  });

  it("keeps one badge-carrying entry per card when the option is off", () => {
    const card = stubDeckBuilderCard({ quantity: 3 });
    expect(expandCopies([card], false)).toEqual([{ card, copyIndex: null }]);
  });

  it("splits a stacked entry into one entry per physical copy", () => {
    const card = stubDeckBuilderCard({ quantity: 3 });
    expect(expandCopies([card], true)).toEqual([
      { card, copyIndex: 0 },
      { card, copyIndex: 1 },
      { card, copyIndex: 2 },
    ]);
  });

  it("leaves a single copy unindexed", () => {
    const card = stubDeckBuilderCard({ quantity: 1 });
    expect(expandCopies([card], true)).toEqual([{ card, copyIndex: null }]);
  });
});

describe("zoneShowsAllCopies", () => {
  it("expands a non-rune zone whenever the main switch is on", () => {
    expect(zoneShowsAllCopies(WellKnown.deckZone.MAIN, true, false)).toBe(true);
    expect(zoneShowsAllCopies(WellKnown.deckZone.MAIN, false, true)).toBe(false);
  });

  it("keeps runes stacked until their own switch is on as well", () => {
    expect(zoneShowsAllCopies(WellKnown.deckZone.RUNES, true, false)).toBe(false);
    expect(zoneShowsAllCopies(WellKnown.deckZone.RUNES, true, true)).toBe(true);
    expect(zoneShowsAllCopies(WellKnown.deckZone.RUNES, false, true)).toBe(false);
  });
});
