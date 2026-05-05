import { describe, expect, it } from "vitest";

import { stubDeckBuilderCard } from "@/test/factories";

import { compareDeckCardsByCurve, sortOverviewCards } from "./deck-card-sort";

describe("compareDeckCardsByCurve", () => {
  it("sorts by energy ascending first", () => {
    const a = stubDeckBuilderCard({ energy: 3, power: 1, cardName: "B" });
    const b = stubDeckBuilderCard({ energy: 1, power: 5, cardName: "A" });
    expect(compareDeckCardsByCurve(a, b)).toBeGreaterThan(0);
    expect(compareDeckCardsByCurve(b, a)).toBeLessThan(0);
  });

  it("breaks energy ties with power ascending", () => {
    const a = stubDeckBuilderCard({ energy: 2, power: 3, cardName: "B" });
    const b = stubDeckBuilderCard({ energy: 2, power: 1, cardName: "A" });
    expect(compareDeckCardsByCurve(a, b)).toBeGreaterThan(0);
  });

  it("breaks remaining ties with card name alphabetical", () => {
    const a = stubDeckBuilderCard({ energy: 2, power: 2, cardName: "Zed" });
    const b = stubDeckBuilderCard({ energy: 2, power: 2, cardName: "Ahri" });
    expect(compareDeckCardsByCurve(a, b)).toBeGreaterThan(0);
  });

  it("treats null energy and power as zero", () => {
    const a = stubDeckBuilderCard({ energy: null, power: null, cardName: "A" });
    const b = stubDeckBuilderCard({ energy: 0, power: 0, cardName: "B" });
    expect(compareDeckCardsByCurve(a, b)).toBeLessThan(0);
  });
});

describe("sortOverviewCards", () => {
  it("returns raw order unchanged for non-grouped zones", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "x", zone: "legend", energy: 5 }),
      stubDeckBuilderCard({ cardId: "y", zone: "legend", energy: 1 }),
    ];
    const result = sortOverviewCards(cards, "legend");
    expect(result).toBe(cards);
  });

  it("sorts grouped zones by type group (Unit → Spell → Gear) then curve", () => {
    const spell = stubDeckBuilderCard({
      cardId: "spell",
      cardType: "spell",
      energy: 1,
      cardName: "spell",
    });
    const gear = stubDeckBuilderCard({
      cardId: "gear",
      cardType: "gear",
      energy: 1,
      cardName: "gear",
    });
    const unit = stubDeckBuilderCard({
      cardId: "unit",
      cardType: "unit",
      energy: 3,
      cardName: "unit",
    });
    const result = sortOverviewCards([gear, spell, unit], "main");
    expect(result.map((card) => card.cardId)).toEqual(["unit", "spell", "gear"]);
  });

  it("orders multiple cards within a type group by curve", () => {
    const highEnergy = stubDeckBuilderCard({
      cardId: "high",
      cardType: "unit",
      energy: 5,
      cardName: "Zed",
    });
    const lowEnergy = stubDeckBuilderCard({
      cardId: "low",
      cardType: "unit",
      energy: 1,
      cardName: "Ahri",
    });
    const midEnergyHighPower = stubDeckBuilderCard({
      cardId: "mid-high",
      cardType: "unit",
      energy: 3,
      power: 5,
    });
    const midEnergyLowPower = stubDeckBuilderCard({
      cardId: "mid-low",
      cardType: "unit",
      energy: 3,
      power: 1,
    });
    const result = sortOverviewCards(
      [highEnergy, midEnergyHighPower, lowEnergy, midEnergyLowPower],
      "main",
    );
    expect(result.map((card) => card.cardId)).toEqual(["low", "mid-low", "mid-high", "high"]);
  });

  it("appends unknown types after the known type groups", () => {
    const unit = stubDeckBuilderCard({ cardId: "unit", cardType: "unit", cardName: "A" });
    const legend = stubDeckBuilderCard({
      cardId: "legend",
      cardType: "legend",
      cardName: "A",
    });
    const result = sortOverviewCards([legend, unit], "main");
    expect(result.map((card) => card.cardId)).toEqual(["unit", "legend"]);
  });
});
