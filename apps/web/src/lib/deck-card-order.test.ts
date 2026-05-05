import { beforeEach, describe, expect, it } from "vitest";

import { compareGroupedCards, sortCardsLikeSidebar } from "@/lib/deck-card-order";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

describe("compareGroupedCards", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("orders by type group first (Unit → Spell → Gear)", () => {
    const spell = stubDeckBuilderCard({ cardType: "spell", cardName: "A", energy: 1 });
    const gear = stubDeckBuilderCard({ cardType: "gear", cardName: "A", energy: 1 });
    const unit = stubDeckBuilderCard({ cardType: "unit", cardName: "A", energy: 1 });

    const sorted = [gear, spell, unit].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.cardType)).toEqual(["unit", "spell", "gear"]);
  });

  it("orders by energy asc within the same type", () => {
    const high = stubDeckBuilderCard({ cardType: "unit", energy: 5, cardName: "B" });
    const low = stubDeckBuilderCard({ cardType: "unit", energy: 1, cardName: "A" });

    const sorted = [high, low].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.energy)).toEqual([1, 5]);
  });

  it("breaks ties by power, then name", () => {
    const aHighPower = stubDeckBuilderCard({
      cardType: "unit",
      energy: 2,
      power: 4,
      cardName: "Aaa",
    });
    const aLowPower = stubDeckBuilderCard({
      cardType: "unit",
      energy: 2,
      power: 1,
      cardName: "Zzz",
    });
    const bSamePower = stubDeckBuilderCard({
      cardType: "unit",
      energy: 2,
      power: 4,
      cardName: "Zzz",
    });

    const sorted = [bSamePower, aHighPower, aLowPower].toSorted(compareGroupedCards);

    expect(sorted.map((card) => card.cardName)).toEqual(["Zzz", "Aaa", "Zzz"]);
    expect(sorted.map((card) => card.power)).toEqual([1, 4, 4]);
  });

  it("treats null energy/power as 0", () => {
    const hasEnergy = stubDeckBuilderCard({ cardType: "unit", energy: 3, cardName: "A" });
    const nullEnergy = stubDeckBuilderCard({ cardType: "unit", energy: null, cardName: "B" });

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
    const mainCard = stubDeckBuilderCard({ zone: "main", cardType: "unit", cardName: "M" });
    const legendCard = stubDeckBuilderCard({ zone: "legend", cardType: "legend", cardName: "L" });
    const runesCard = stubDeckBuilderCard({ zone: "runes", cardType: "rune", cardName: "R" });

    const sorted = sortCardsLikeSidebar([runesCard, mainCard, legendCard], [...ZONE_ORDER]);

    expect(sorted.map((card) => card.zone)).toEqual(["legend", "main", "runes"]);
  });

  it("sorts cards inside grouped zones but keeps insertion order for non-grouped zones", () => {
    const bfFirst = stubDeckBuilderCard({
      zone: "battlefield",
      cardType: "battlefield",
      cardName: "Zulu",
    });
    const bfSecond = stubDeckBuilderCard({
      zone: "battlefield",
      cardType: "battlefield",
      cardName: "Alpha",
    });
    const mainUnit = stubDeckBuilderCard({
      zone: "main",
      cardType: "unit",
      energy: 3,
      cardName: "Z",
    });
    const mainSpell = stubDeckBuilderCard({
      zone: "main",
      cardType: "spell",
      energy: 1,
      cardName: "A",
    });

    const sorted = sortCardsLikeSidebar([bfFirst, bfSecond, mainUnit, mainSpell], [...ZONE_ORDER]);

    expect(sorted.map((card) => card.cardName)).toEqual(["Z", "A", "Zulu", "Alpha"]);
  });

  it("does not mutate the input array", () => {
    const cards = [
      stubDeckBuilderCard({ zone: "main", cardType: "spell", energy: 5, cardName: "B" }),
      stubDeckBuilderCard({ zone: "main", cardType: "unit", energy: 1, cardName: "A" }),
    ];
    const snapshot = cards.map((card) => card.cardName);

    sortCardsLikeSidebar(cards, [...ZONE_ORDER]);

    expect(cards.map((card) => card.cardName)).toEqual(snapshot);
  });
});
