import type { CardType, DeckZone } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { curveOutRate, deckCompositionSeed, mulberry32 } from "@/lib/deck-curve-out";
import { stubDeckBuilderCard } from "@/test/factories";

function mainCard(cost: { energy: number | null; power?: number | null }, quantity = 1) {
  return stubDeckBuilderCard({
    zone: "main" as DeckZone,
    cardTypes: ["unit" as CardType],
    energy: cost.energy,
    power: cost.power ?? 0,
    quantity,
  });
}

describe("mulberry32", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let index = 0; index < 100; index++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("deckCompositionSeed", () => {
  it("ignores entry order and non-main zones", () => {
    const unit = mainCard({ energy: 2 }, 3);
    const other = mainCard({ energy: 4 }, 2);
    const rune = stubDeckBuilderCard({
      zone: "runes" as DeckZone,
      cardTypes: ["rune" as CardType],
    });
    expect(deckCompositionSeed([unit, other])).toBe(deckCompositionSeed([other, unit, rune]));
  });

  it("changes when a quantity changes", () => {
    const unit = mainCard({ energy: 2 }, 3);
    const bumped = { ...unit, quantity: 2 };
    expect(deckCompositionSeed([unit])).not.toBe(deckCompositionSeed([bumped]));
  });
});

describe("curveOutRate", () => {
  it("returns null for an empty main deck", () => {
    expect(curveOutRate([], { goingSecond: false })).toBeNull();
  });

  it("always curves out when every card is free", () => {
    const cards = [mainCard({ energy: 0 }, 39)];
    expect(curveOutRate(cards, { goingSecond: false })).toBe(1);
    expect(curveOutRate(cards, { goingSecond: true })).toBe(1);
  });

  it("never curves out when every card is dead on the early turns", () => {
    // 7-cost cards can't be played on turn 1 either way (2 or 3 runes), and a
    // curve-out needs a play on every turn.
    const cards = [mainCard({ energy: 7 }, 39)];
    expect(curveOutRate(cards, { goingSecond: false, throughTurn: 3 })).toBe(0);
    expect(curveOutRate(cards, { goingSecond: true, throughTurn: 3 })).toBe(0);
    // A deck of 2-cost cards fits every turn's budget on both play orders.
    const cheap = [mainCard({ energy: 2 }, 39)];
    expect(curveOutRate(cheap, { goingSecond: false, throughTurn: 3 })).toBe(1);
    expect(curveOutRate(cheap, { goingSecond: true, throughTurn: 3 })).toBe(1);
  });

  it("counts energy plus power as the rune demand", () => {
    // 1 energy + 2 power = 3 runes: unaffordable turn 1 going first (2 runes),
    // affordable going second (3 runes).
    const cards = [mainCard({ energy: 1, power: 2 }, 39)];
    expect(curveOutRate(cards, { goingSecond: false, throughTurn: 1 })).toBe(0);
    expect(curveOutRate(cards, { goingSecond: true, throughTurn: 1 })).toBe(1);
  });

  it("does not accept a spell as the turn-1 play", () => {
    const spells = [
      stubDeckBuilderCard({
        zone: "main" as DeckZone,
        cardTypes: ["spell" as CardType],
        energy: 0,
        power: 0,
        quantity: 39,
      }),
    ];
    expect(curveOutRate(spells, { goingSecond: false, throughTurn: 1 })).toBe(0);
    // From turn 2 on the same spells are fine.
    const mixed = [mainCard({ energy: 0 }, 4), ...spells];
    expect(curveOutRate(mixed, { goingSecond: false, throughTurn: 1 })).toBeGreaterThan(0);
  });

  it("is deterministic for the same deck and differs between play orders", () => {
    const cards = [
      mainCard({ energy: 2 }, 8),
      mainCard({ energy: 4 }, 16),
      mainCard({ energy: 6 }, 15),
    ];
    const first = curveOutRate(cards, { goingSecond: false });
    expect(first).toBe(curveOutRate(cards, { goingSecond: false }));
    expect(first).not.toBeNull();
    // Going second sees one more card and one more rune per turn, so the rate
    // can only be at least as good.
    const second = curveOutRate(cards, { goingSecond: true });
    expect(second ?? 0).toBeGreaterThanOrEqual(first ?? 0);
  });

  it("degrades when the curve gets top-heavy", () => {
    const smooth = [
      mainCard({ energy: 1 }, 13),
      mainCard({ energy: 2 }, 13),
      mainCard({ energy: 3 }, 13),
    ];
    const topHeavy = [mainCard({ energy: 1 }, 3), mainCard({ energy: 6 }, 36)];
    const smoothRate = curveOutRate(smooth, { goingSecond: false }) ?? 0;
    const topHeavyRate = curveOutRate(topHeavy, { goingSecond: false }) ?? 0;
    expect(smoothRate).toBeGreaterThan(topHeavyRate);
  });
});
