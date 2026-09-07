import { describe, expect, it } from "vitest";

import {
  buildDrawOddsRows,
  chanceToDraw,
  formatChancePct,
  OPENING_HAND_SIZE,
} from "./deck-draw-odds";

describe("chanceToDraw", () => {
  it("is 0 with no copies and 1 when drawing the whole deck", () => {
    expect(chanceToDraw(0, 39, 4)).toBe(0);
    expect(chanceToDraw(3, 39, 39)).toBe(1);
  });

  it("matches the hand-computed hypergeometric for 3-of in 39", () => {
    // 1 - C(36,4)/C(39,4) = 1 - (36*35*34*33)/(39*38*37*36) ≈ 0.2838
    expect(chanceToDraw(3, 39, OPENING_HAND_SIZE)).toBeCloseTo(0.2838, 3);
  });

  it("grows with more draws", () => {
    const opening = chanceToDraw(3, 39, 4);
    const early = chanceToDraw(3, 39, 7);
    expect(early).toBeGreaterThan(opening);
    expect(early).toBeLessThan(1);
  });

  it("handles a single copy", () => {
    // 1 - C(38,4)/C(39,4) = 4/39
    expect(chanceToDraw(1, 39, 4)).toBeCloseTo(4 / 39, 10);
  });
});

describe("buildDrawOddsRows", () => {
  const card = (cardId: string, cardName: string, quantity: number, zone = "main") => ({
    cardId,
    cardName,
    quantity,
    zone: zone as "main",
  });

  it("only counts the main deck and sorts by copies, then name", () => {
    const rows = buildDrawOddsRows([
      card("a", "Beta", 3),
      card("b", "Alpha", 3),
      card("c", "Solo", 1),
      card("d", "Sideboard Card", 3, "sideboard"),
      card("e", "Rune", 12, "runes"),
    ]);
    expect(rows.map((row) => row.cardName)).toEqual(["Alpha", "Beta", "Solo"]);
    expect(rows[0]!.openingChance).toBeCloseTo(chanceToDraw(3, 7, 4), 10);
  });

  it("returns nothing for an empty main deck", () => {
    expect(buildDrawOddsRows([card("e", "Rune", 12, "runes")])).toEqual([]);
  });

  it("merges a card split across entries into one row with combined odds", () => {
    const rows = buildDrawOddsRows([
      card("a", "Brutalizer", 2),
      card("a", "Brutalizer", 2),
      card("b", "Filler", 3),
    ]);
    expect(rows.map((row) => [row.cardId, row.copies])).toEqual([
      ["a", 4],
      ["b", 3],
    ]);
    expect(rows[0]!.openingChance).toBeCloseTo(chanceToDraw(4, 7, 4), 10);
  });
});

describe("formatChancePct", () => {
  it("reserves 100% and 0% for true certainties", () => {
    expect(formatChancePct(1)).toBe("100%");
    expect(formatChancePct(0)).toBe("0%");
    expect(formatChancePct(0.999)).toBe(">99%");
    expect(formatChancePct(0.0001)).toBe("<1%");
    expect(formatChancePct(0.284)).toBe("28%");
  });
});
