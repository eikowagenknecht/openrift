import { beforeEach, describe, expect, it } from "vitest";

import { compareGroupedCards, sortCardsLikeSidebar } from "@/lib/deck-card-order";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

describe("compareGroupedCards", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("orders by type group first (Unit → Spell → Gear)", () => {
    const spell = stubDeckBuilderCard({ cardType: "Spell", cardName: "A", energy: 1 });
    const gear = stubDeckBuilderCard({ cardType: "Gear", cardName: "A", energy: 1 });
    const unit = stubDeckBuilderCard({ cardType: "Unit", cardName: "A", energy: 1 });

    const sorted = [gear, spell, unit].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.cardType)).toEqual(["Unit", "Spell", "Gear"]);
  });

  it("orders by energy asc within the same type", () => {
    const high = stubDeckBuilderCard({ cardType: "Unit", energy: 5, cardName: "B" });
    const low = stubDeckBuilderCard({ cardType: "Unit", energy: 1, cardName: "A" });

    const sorted = [high, low].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.energy)).toEqual([1, 5]);
  });

  it("breaks ties by power, then name", () => {
    const aHighPower = stubDeckBuilderCard({
      cardType: "Unit",
      energy: 2,
      power: 4,
      cardName: "Aaa",
    });
    const aLowPower = stubDeckBuilderCard({
      cardType: "Unit",
      energy: 2,
      power: 1,
      cardName: "Zzz",
    });
    const bSamePower = stubDeckBuilderCard({
      cardType: "Unit",
      energy: 2,
      power: 4,
      cardName: "Zzz",
    });

    const sorted = [bSamePower, aHighPower, aLowPower].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.cardName)).toEqual(["Zzz", "Aaa", "Zzz"]);
    expect(sorted.map((card) => card.power)).toEqual([1, 4, 4]);
  });

  it("treats null energy/power as 0", () => {
    const hasEnergy = stubDeckBuilderCard({ cardType: "Unit", energy: 3, cardName: "A" });
    const nullEnergy = stubDeckBuilderCard({ cardType: "Unit", energy: null, cardName: "B" });

    const sorted = [hasEnergy, nullEnergy].toSorted(compareGroupedCards);

    expect(sorted[0]).toBe(nullEnergy);
  });
});

describe("sortCardsLikeSidebar", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  const ZONE_ORDER = [
    "legend",
    "champion",
    "main",
    "battlefield",
    "runes",
    "sideboard",
    "overflow",
  ] as const;

  it("orders cards by zone order", () => {
    const mainCard = stubDeckBuilderCard({ zone: "main", cardType: "Unit", cardName: "M" });
    const legendCard = stubDeckBuilderCard({ zone: "legend", cardType: "Legend", cardName: "L" });
    const runesCard = stubDeckBuilderCard({ zone: "runes", cardType: "Rune", cardName: "R" });

    const sorted = sortCardsLikeSidebar([runesCard, mainCard, legendCard], [...ZONE_ORDER]);

    expect(sorted.map((card) => card.zone)).toEqual(["legend", "main", "runes"]);
  });

  it("sorts cards inside grouped zones but keeps insertion order for non-grouped zones", () => {
    const bfFirst = stubDeckBuilderCard({
      zone: "battlefield",
      cardType: "Battlefield",
      cardName: "Zulu",
    });
    const bfSecond = stubDeckBuilderCard({
      zone: "battlefield",
      cardType: "Battlefield",
      cardName: "Alpha",
    });
    const mainUnit = stubDeckBuilderCard({
      zone: "main",
      cardType: "Unit",
      energy: 3,
      cardName: "Z",
    });
    const mainSpell = stubDeckBuilderCard({
      zone: "main",
      cardType: "Spell",
      energy: 1,
      cardName: "A",
    });

    const sorted = sortCardsLikeSidebar([bfFirst, bfSecond, mainUnit, mainSpell], [...ZONE_ORDER]);

    expect(sorted.map((card) => card.cardName)).toEqual(["Z", "A", "Zulu", "Alpha"]);
  });

  it("does not mutate the input array", () => {
    const cards = [
      stubDeckBuilderCard({ zone: "main", cardType: "Spell", energy: 5, cardName: "B" }),
      stubDeckBuilderCard({ zone: "main", cardType: "Unit", energy: 1, cardName: "A" }),
    ];
    const snapshot = cards.map((card) => card.cardName);

    sortCardsLikeSidebar(cards, [...ZONE_ORDER]);

    expect(cards.map((card) => card.cardName)).toEqual(snapshot);
  });
});
