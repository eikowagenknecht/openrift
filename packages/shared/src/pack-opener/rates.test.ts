import { describe, expect, it } from "vitest";

import {
  COMMONS_PER_PACK,
  FLEX_EPIC_RATE,
  FLEX_SLOTS_PER_PACK,
  FOIL_RARITY_WEIGHTS,
  SHOWCASE_ALTART_RATE,
  SHOWCASE_OVERNUMBERED_RATE,
  SHOWCASE_SIGNED_RATE,
  TOKEN_SLOT_ALTART_RUNE_RATE,
  TOKEN_SLOT_FOIL_RUNE_RATE,
  TOKEN_SLOT_TOKEN_RATE,
  ULTIMATE_RATE,
  UNCOMMONS_PER_PACK,
} from "./rates";

describe("pack slot counts", () => {
  it("are positive whole numbers", () => {
    for (const count of [COMMONS_PER_PACK, UNCOMMONS_PER_PACK, FLEX_SLOTS_PER_PACK]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe("FLEX_EPIC_RATE", () => {
  it("leaves a three-in-four chance that neither flex slot is epic", () => {
    expect((1 - FLEX_EPIC_RATE) ** FLEX_SLOTS_PER_PACK).toBeCloseTo(0.75, 12);
  });
});

describe("FOIL_RARITY_WEIGHTS", () => {
  it("sums to one across the four rarities", () => {
    const total = Object.values(FOIL_RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("weights the rarities in descending order of commonness", () => {
    const weights = Object.values(FOIL_RARITY_WEIGHTS);
    expect(weights).toEqual(weights.toSorted((a, b) => b - a));
  });
});

describe("showcase and token rates", () => {
  it("are probabilities strictly between zero and one", () => {
    for (const rate of [
      FLEX_EPIC_RATE,
      SHOWCASE_ALTART_RATE,
      SHOWCASE_OVERNUMBERED_RATE,
      SHOWCASE_SIGNED_RATE,
      ULTIMATE_RATE,
      TOKEN_SLOT_ALTART_RUNE_RATE,
      TOKEN_SLOT_FOIL_RUNE_RATE,
      TOKEN_SLOT_TOKEN_RATE,
    ]) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(1);
    }
  });

  it("orders the showcase tiers from altart down to signed", () => {
    expect(SHOWCASE_ALTART_RATE).toBeGreaterThan(SHOWCASE_OVERNUMBERED_RATE);
    expect(SHOWCASE_OVERNUMBERED_RATE).toBeGreaterThan(SHOWCASE_SIGNED_RATE);
  });

  it("keeps the token slot's three outcomes under one", () => {
    expect(
      TOKEN_SLOT_ALTART_RUNE_RATE + TOKEN_SLOT_FOIL_RUNE_RATE + TOKEN_SLOT_TOKEN_RATE,
    ).toBeLessThan(1);
  });
});
