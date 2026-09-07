import type { CardType, DeckZone, Domain, EnumOrders } from "@openrift/shared/types/enums";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

const TEST_ORDERS: EnumOrders = {
  finishes: ["normal", "foil"],
  rarities: ["common", "uncommon", "rare"],
  domains: ["fury", "calm", "mind", "body", "chaos", "order", "colorless"],
  cardTypes: ["legend", "unit", "spell", "gear", "rune", "battlefield"],
  superTypes: ["champion"],
  artVariants: ["normal"],
  cardSizes: ["standard"],
};

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: TEST_ORDERS, labels: {} }),
}));

const { useDeckStats } = await import("./use-deck-stats");

afterEach(() => {
  resetIdCounter();
});

function statsFor(cards: DeckBuilderCard[]) {
  return renderHook(() => useDeckStats(cards)).result.current;
}

function card(overrides: Partial<DeckBuilderCard> = {}): DeckBuilderCard {
  return stubDeckBuilderCard({ domains: ["fury"] as Domain[], ...overrides });
}

const MAIN = "main" as DeckZone;
const CHAMPION = "champion" as DeckZone;

describe("useDeckStats", () => {
  it("returns empty stats for an empty deck", () => {
    expect(statsFor([])).toEqual({
      domainDistribution: [],
      energyCurve: [],
      energyCurveStacks: [],
      averageEnergy: null,
      powerCurve: [],
      powerCurveStacks: [],
      averagePower: null,
      typeBreakdown: [],
      typeBreakdownDomains: [],
      totalCards: 0,
    });
  });

  describe("zone filtering", () => {
    it("counts main and champion zones and ignores every other zone", () => {
      const stats = statsFor([
        card({ zone: MAIN }),
        card({ zone: CHAMPION }),
        card({ zone: "sideboard" as DeckZone }),
        card({ zone: "overflow" as DeckZone }),
        card({ zone: "legend" as DeckZone }),
        card({ zone: "runes" as DeckZone }),
        card({ zone: "battlefield" as DeckZone }),
      ]);

      expect(stats.totalCards).toBe(2);
      expect(stats.domainDistribution).toEqual([{ domain: "fury", count: 2 }]);
      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 2, fury: 2 }]);
    });

    it("returns empty stats when no card sits in a main zone", () => {
      const stats = statsFor([card({ zone: "sideboard" as DeckZone })]);

      expect(stats.totalCards).toBe(0);
      expect(stats.energyCurve).toEqual([]);
      expect(stats.powerCurve).toEqual([]);
      expect(stats.averageEnergy).toBeNull();
      expect(stats.averagePower).toBeNull();
    });
  });

  describe("type breakdown", () => {
    it("drops legend, rune, and battlefield types but still counts them elsewhere", () => {
      const stats = statsFor([
        card({ cardTypes: ["unit"] as CardType[], energy: 2 }),
        card({ cardTypes: ["rune"] as CardType[], energy: 2 }),
        card({ cardTypes: ["legend"] as CardType[], energy: 2 }),
        card({ cardTypes: ["battlefield"] as CardType[], energy: 2 }),
      ]);

      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 1, fury: 1 }]);
      expect(stats.totalCards).toBe(4);
      expect(stats.energyCurve).toEqual([{ energy: "2", fury: 4 }]);
    });

    it("counts a multi-type card under each of its types", () => {
      const stats = statsFor([card({ cardTypes: ["unit", "spell"] as CardType[], quantity: 2 })]);

      expect(stats.typeBreakdown).toEqual([
        { type: "unit", total: 2, fury: 2 },
        { type: "spell", total: 2, fury: 2 },
      ]);
      expect(stats.totalCards).toBe(2);
    });

    it("skips the excluded type of a card that also has a kept type", () => {
      const stats = statsFor([card({ cardTypes: ["unit", "rune"] as CardType[] })]);

      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 1, fury: 1 }]);
    });

    it("orders types by the enum order and splits each total by domain", () => {
      const stats = statsFor([
        card({ cardTypes: ["gear"] as CardType[], domains: ["mind"] as Domain[] }),
        card({ cardTypes: ["unit"] as CardType[], domains: ["fury"] as Domain[], quantity: 3 }),
        card({ cardTypes: ["spell"] as CardType[], domains: ["fury", "mind"] as Domain[] }),
      ]);

      expect(stats.typeBreakdownDomains).toEqual(["fury", "mind"]);
      expect(stats.typeBreakdown).toEqual([
        { type: "unit", total: 3, fury: 3, mind: 0 },
        { type: "spell", total: 1, fury: 1, mind: 1 },
        { type: "gear", total: 1, fury: 0, mind: 1 },
      ]);
    });

    it("keeps a domainless card's type total without any domain split", () => {
      const stats = statsFor([card({ domains: [] as Domain[], quantity: 2 })]);

      expect(stats.typeBreakdownDomains).toEqual([]);
      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 2 }]);
      expect(stats.domainDistribution).toEqual([]);
    });

    it("drops a type that is missing from the enum order", () => {
      const stats = statsFor([card({ cardTypes: ["contraption"] as CardType[] })]);

      expect(stats.typeBreakdown).toEqual([]);
      expect(stats.totalCards).toBe(1);
    });
  });

  describe("domain distribution", () => {
    it("counts a two-domain card under both domains", () => {
      const stats = statsFor([card({ domains: ["fury", "calm"] as Domain[], quantity: 3 })]);

      expect(stats.domainDistribution).toEqual([
        { domain: "fury", count: 3 },
        { domain: "calm", count: 3 },
      ]);
      expect(stats.totalCards).toBe(3);
    });

    it("orders domains by the enum order, not by first appearance or count", () => {
      const stats = statsFor([
        card({ domains: ["chaos"] as Domain[], quantity: 5 }),
        card({ domains: ["calm"] as Domain[] }),
        card({ domains: ["fury"] as Domain[] }),
      ]);

      expect(stats.domainDistribution).toEqual([
        { domain: "fury", count: 1 },
        { domain: "calm", count: 1 },
        { domain: "chaos", count: 5 },
      ]);
    });

    it("drops a domain that is missing from the enum order", () => {
      const stats = statsFor([card({ domains: ["shadow"] as Domain[] })]);

      expect(stats.domainDistribution).toEqual([]);
      expect(stats.energyCurveStacks).toEqual([{ key: "shadow", domains: ["shadow"] }]);
      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 1 }]);
    });
  });

  describe("energy curve", () => {
    it("spans every value from the lowest to the highest cost, zero-filling gaps", () => {
      const stats = statsFor([
        card({ energy: 0 }),
        card({ energy: 2 }),
        card({ energy: 3, quantity: 2 }),
      ]);

      expect(stats.energyCurve).toEqual([
        { energy: "0", fury: 1 },
        { energy: "1", fury: 0 },
        { energy: "2", fury: 1 },
        { energy: "3", fury: 2 },
      ]);
    });

    it("starts at the deck's lowest cost rather than at zero", () => {
      const stats = statsFor([card({ energy: 4 })]);

      expect(stats.energyCurve).toEqual([{ energy: "4", fury: 1 }]);
    });

    it("does not cap the top bucket", () => {
      const stats = statsFor([card({ energy: 1 }), card({ energy: 12 })]);

      expect(stats.energyCurve).toHaveLength(12);
      expect(stats.energyCurve.at(-1)).toEqual({ energy: "12", fury: 1 });
    });

    it("skips cards without an energy cost", () => {
      const stats = statsFor([card({ energy: null, power: 4 }), card({ energy: 2 })]);

      expect(stats.energyCurve).toEqual([{ energy: "2", fury: 1 }]);
      expect(stats.averageEnergy).toBe(2);
      expect(stats.totalCards).toBe(2);
      expect(stats.domainDistribution).toEqual([{ domain: "fury", count: 2 }]);
    });

    it("leaves the curve empty when no card has an energy cost", () => {
      const stats = statsFor([card({ energy: null })]);

      expect(stats.energyCurve).toEqual([]);
      expect(stats.energyCurveStacks).toEqual([]);
      expect(stats.averageEnergy).toBeNull();
    });

    it("weights the average by quantity", () => {
      const stats = statsFor([card({ energy: 1, quantity: 3 }), card({ energy: 5 })]);

      expect(stats.averageEnergy).toBe(2);
    });
  });

  describe("power curve", () => {
    it("treats a missing power as zero", () => {
      const stats = statsFor([card({ power: null }), card({ power: 2 })]);

      expect(stats.powerCurve).toEqual([
        { power: "0", fury: 1 },
        { power: "1", fury: 0 },
        { power: "2", fury: 1 },
      ]);
      expect(stats.averagePower).toBe(1);
    });

    it("weights the average by quantity", () => {
      const stats = statsFor([card({ power: 6, quantity: 3 }), card({ power: 2 })]);

      expect(stats.averagePower).toBe(5);
      expect(stats.powerCurve.at(0)).toEqual({ power: "2", fury: 1 });
      expect(stats.powerCurve.at(-1)).toEqual({ power: "6", fury: 3 });
    });

    it("keeps a power curve for a deck whose cards have no energy cost", () => {
      const stats = statsFor([card({ energy: null, power: 3 })]);

      expect(stats.energyCurve).toEqual([]);
      expect(stats.powerCurve).toEqual([{ power: "3", fury: 1 }]);
      expect(stats.averagePower).toBe(3);
    });
  });

  describe("domain combo stacks", () => {
    it("interleaves single domains and combos by average domain position", () => {
      const stats = statsFor([
        card({ domains: ["calm"] as Domain[], energy: 1 }),
        card({ domains: ["fury", "calm"] as Domain[], energy: 1 }),
        card({ domains: ["fury"] as Domain[], energy: 1 }),
      ]);

      expect(stats.energyCurveStacks.map((stack) => stack.key)).toEqual([
        "fury",
        "fury+calm",
        "calm",
      ]);
      expect(stats.energyCurve).toEqual([{ energy: "1", fury: 1, "fury+calm": 1, calm: 1 }]);
    });

    it("normalises a combo key to the enum domain order", () => {
      const stats = statsFor([card({ domains: ["calm", "fury"] as Domain[] })]);

      expect(stats.energyCurveStacks).toEqual([{ key: "fury+calm", domains: ["fury", "calm"] }]);
    });

    it("gives a domainless card an empty-string stack key", () => {
      const stats = statsFor([card({ domains: [] as Domain[], energy: 3 })]);

      expect(stats.energyCurveStacks).toEqual([{ key: "", domains: [""] }]);
      expect(stats.energyCurve).toEqual([{ energy: "3", "": 1 }]);
    });

    it("shares the same stack set across every bucket of a curve", () => {
      const stats = statsFor([
        card({ domains: ["fury"] as Domain[], energy: 1 }),
        card({ domains: ["calm"] as Domain[], energy: 2 }),
      ]);

      expect(stats.energyCurve).toEqual([
        { energy: "1", fury: 1, calm: 0 },
        { energy: "2", fury: 0, calm: 1 },
      ]);
    });
  });

  describe("quantity weighting", () => {
    it("counts a three-copy card three times everywhere", () => {
      const stats = statsFor([
        card({ domains: ["fury", "calm"] as Domain[], energy: 2, power: 4, quantity: 3 }),
      ]);

      expect(stats.totalCards).toBe(3);
      expect(stats.domainDistribution).toEqual([
        { domain: "fury", count: 3 },
        { domain: "calm", count: 3 },
      ]);
      expect(stats.energyCurve).toEqual([{ energy: "2", "fury+calm": 3 }]);
      expect(stats.powerCurve).toEqual([{ power: "4", "fury+calm": 3 }]);
      expect(stats.typeBreakdown).toEqual([{ type: "unit", total: 3, fury: 3, calm: 3 }]);
      expect(stats.averageEnergy).toBe(2);
      expect(stats.averagePower).toBe(4);
    });
  });
});
