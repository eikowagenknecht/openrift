import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { getDeckCardKey } from "@/lib/deck-builder-card";
import { chanceToDraw, OPENING_HAND_SIZE } from "@/lib/deck-draw-odds";
import {
  cardMatchesStatsFocus,
  statsFocusCount,
  statsFocusLabel,
  statsFocusOpeningChance,
} from "@/lib/deck-stats-focus";
import { stubDeckBuilderCard } from "@/test/factories";

const main = (overrides: Parameters<typeof stubDeckBuilderCard>[0] = {}) =>
  stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, ...overrides });

describe("cardMatchesStatsFocus", () => {
  it("matches main-deck cards by energy", () => {
    expect(cardMatchesStatsFocus(main({ energy: 2 }), { kind: "energy", value: 2 })).toBe(true);
    expect(cardMatchesStatsFocus(main({ energy: 3 }), { kind: "energy", value: 2 })).toBe(false);
    expect(cardMatchesStatsFocus(main({ energy: null }), { kind: "energy", value: 2 })).toBe(false);
  });

  it("counts the champion as part of the population", () => {
    const champion = stubDeckBuilderCard({ zone: WellKnown.deckZone.CHAMPION, energy: 2 });
    expect(cardMatchesStatsFocus(champion, { kind: "energy", value: 2 })).toBe(true);
  });

  it("never matches cards outside the charts' population", () => {
    const rune = stubDeckBuilderCard({ zone: WellKnown.deckZone.RUNES, energy: 2 });
    const sideboard = stubDeckBuilderCard({ zone: WellKnown.deckZone.SIDEBOARD, energy: 2 });
    expect(cardMatchesStatsFocus(rune, { kind: "energy", value: 2 })).toBe(false);
    expect(cardMatchesStatsFocus(sideboard, { kind: "energy", value: 2 })).toBe(false);
  });

  it("treats missing power as 0, matching the power curve", () => {
    expect(cardMatchesStatsFocus(main({ power: null }), { kind: "power", value: 0 })).toBe(true);
    expect(cardMatchesStatsFocus(main({ power: 2 }), { kind: "power", value: 2 })).toBe(true);
    expect(cardMatchesStatsFocus(main({ power: 2 }), { kind: "power", value: 0 })).toBe(false);
  });

  it("matches any of a multi-type card's types", () => {
    const card = main({ cardTypes: ["unit", "gear"] });
    expect(cardMatchesStatsFocus(card, { kind: "type", value: "unit" })).toBe(true);
    expect(cardMatchesStatsFocus(card, { kind: "type", value: "gear" })).toBe(true);
    expect(cardMatchesStatsFocus(card, { kind: "type", value: "spell" })).toBe(false);
  });

  it("matches rarity and ownership focuses via their key sets", () => {
    const card = main({ cardId: "a" });
    const key = getDeckCardKey(card);
    expect(
      cardMatchesStatsFocus(card, { kind: "rarity", value: "rare", cardKeys: new Set([key]) }),
    ).toBe(true);
    expect(
      cardMatchesStatsFocus(card, { kind: "rarity", value: "rare", cardKeys: new Set() }),
    ).toBe(false);
    expect(
      cardMatchesStatsFocus(card, {
        kind: "ownership",
        value: "missing",
        cardKeys: new Set([key]),
      }),
    ).toBe(true);
  });

  it("never matches a key-set focus outside the charts' population", () => {
    const rune = stubDeckBuilderCard({ zone: WellKnown.deckZone.RUNES, cardId: "a" });
    expect(
      cardMatchesStatsFocus(rune, {
        kind: "rarity",
        value: "rare",
        cardKeys: new Set([getDeckCardKey(rune)]),
      }),
    ).toBe(false);
  });
});

describe("statsFocusCount", () => {
  it("sums quantities of matching cards only", () => {
    const cards = [
      main({ energy: 2, quantity: 3 }),
      main({ energy: 2, quantity: 2 }),
      main({ energy: 4, quantity: 3 }),
      stubDeckBuilderCard({ zone: WellKnown.deckZone.RUNES, energy: 2, quantity: 6 }),
    ];
    expect(statsFocusCount(cards, { kind: "energy", value: 2 })).toBe(5);
  });

  it("returns 0 for an empty deck", () => {
    expect(statsFocusCount([], { kind: "type", value: "unit" })).toBe(0);
  });
});

describe("statsFocusOpeningChance", () => {
  it("computes odds over the drawn main deck only", () => {
    const cards = [
      main({ energy: 2, quantity: 3 }),
      main({ energy: 4, quantity: 4 }),
      stubDeckBuilderCard({ zone: WellKnown.deckZone.CHAMPION, energy: 2, quantity: 1 }),
    ];
    expect(statsFocusOpeningChance(cards, { kind: "energy", value: 2 })).toBeCloseTo(
      chanceToDraw(3, 7, OPENING_HAND_SIZE),
      10,
    );
  });

  it("is null when no focused copies are drawable", () => {
    const cards = [
      main({ energy: 4, quantity: 4 }),
      stubDeckBuilderCard({ zone: WellKnown.deckZone.CHAMPION, energy: 2, quantity: 1 }),
    ];
    expect(statsFocusOpeningChance(cards, { kind: "energy", value: 2 })).toBeNull();
    expect(statsFocusOpeningChance([], { kind: "energy", value: 2 })).toBeNull();
  });
});

describe("statsFocusLabel", () => {
  it("labels each focus kind", () => {
    expect(statsFocusLabel({ kind: "energy", value: 2 }, {}, {})).toBe("2-energy cards");
    expect(statsFocusLabel({ kind: "power", value: 1 }, {}, {})).toBe("1-power cards");
    expect(statsFocusLabel({ kind: "type", value: "unit" }, { unit: "Unit" }, {})).toBe("Units");
    expect(
      statsFocusLabel({ kind: "rarity", value: "rare", cardKeys: new Set() }, {}, { rare: "Rare" }),
    ).toBe("Rare cards");
    expect(
      statsFocusLabel({ kind: "ownership", value: "missing", cardKeys: new Set() }, {}, {}),
    ).toBe("Cards with missing copies");
  });
});
