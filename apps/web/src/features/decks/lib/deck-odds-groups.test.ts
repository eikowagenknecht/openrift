import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { chanceToDraw, OPENING_HAND_SIZE } from "@/features/decks/lib/deck-draw-odds";
import {
  cardMatchesOddsGroup,
  defaultOddsGroupKeys,
  isInformativeGroupRow,
  oddsGroupPresets,
  oddsGroupRow,
} from "@/features/decks/lib/deck-odds-groups";
import { stubDeckBuilderCard } from "@/test/factories";

const TYPE_LABELS = { unit: "Unit", spell: "Spell", gear: "Gear" };

const main = (overrides: Parameters<typeof stubDeckBuilderCard>[0] = {}) =>
  stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, ...overrides });

describe("cardMatchesOddsGroup", () => {
  it("requires every provided condition (AND across fields)", () => {
    const trick = { key: "t", label: "t", types: ["spell"], keywords: ["Action", "Reaction"] };
    expect(
      cardMatchesOddsGroup(main({ cardTypes: ["spell"], keywords: ["Reaction"] }), trick),
    ).toBe(true);
    expect(cardMatchesOddsGroup(main({ cardTypes: ["spell"], keywords: [] }), trick)).toBe(false);
    expect(cardMatchesOddsGroup(main({ cardTypes: ["unit"], keywords: ["Reaction"] }), trick)).toBe(
      false,
    );
  });

  it("treats list fields as any-of", () => {
    const def = { key: "d", label: "d", keywords: ["Deflect", "Shield", "Tank"] };
    expect(cardMatchesOddsGroup(main({ keywords: ["Tank"] }), def)).toBe(true);
    expect(cardMatchesOddsGroup(main({ keywords: ["Assault"] }), def)).toBe(false);
  });

  it("never matches a numeric condition against a missing stat", () => {
    const cheap = { key: "c", label: "c", energyMax: 2 };
    expect(cardMatchesOddsGroup(main({ energy: null }), cheap)).toBe(false);
    expect(cardMatchesOddsGroup(main({ energy: 2 }), cheap)).toBe(true);
    const exact = { key: "e", label: "e", energyMin: 2, energyMax: 2 };
    expect(cardMatchesOddsGroup(main({ energy: 2 }), exact)).toBe(true);
    expect(cardMatchesOddsGroup(main({ energy: 3 }), exact)).toBe(false);
  });
});

describe("oddsGroupPresets", () => {
  it("adds a type preset per main-deck card type", () => {
    const presets = oddsGroupPresets(
      [main({ cardTypes: ["unit"] }), main({ cardTypes: ["gear"] })],
      TYPE_LABELS,
    );
    expect(presets.find((preset) => preset.key === "type-gear")?.label).toBe("Any Gear");
    expect(presets.find((preset) => preset.key === "type-spell")).toBeUndefined();
  });
});

describe("oddsGroupRow", () => {
  it("computes copies and odds over the main deck only", () => {
    const cards = [
      main({ cardTypes: ["unit"], energy: 2, quantity: 3 }),
      main({ cardTypes: ["spell"], energy: 4, quantity: 4 }),
      stubDeckBuilderCard({ zone: WellKnown.deckZone.SIDEBOARD, cardTypes: ["unit"], energy: 2 }),
    ];
    const row = oddsGroupRow(cards, { key: "k", label: "k", types: ["unit"], energyMax: 2 });
    expect(row.copies).toBe(3);
    expect(row.openingChance).toBeCloseTo(chanceToDraw(3, 7, OPENING_HAND_SIZE), 10);
  });
});

describe("isInformativeGroupRow", () => {
  it("rejects empty and whole-deck groups", () => {
    const base = { key: "k", label: "k", openingChance: 0.5, earlyChance: 0.5 };
    expect(isInformativeGroupRow({ ...base, copies: 0 }, 39)).toBe(false);
    expect(isInformativeGroupRow({ ...base, copies: 39 }, 39)).toBe(false);
    expect(isInformativeGroupRow({ ...base, copies: 10 }, 39)).toBe(true);
  });
});

describe("defaultOddsGroupKeys", () => {
  it("always includes informative core presets", () => {
    const cards = [
      main({ cardTypes: ["unit"], energy: 2, quantity: 3 }),
      main({ cardTypes: ["spell"], keywords: ["Reaction"], energy: 2, quantity: 3 }),
      main({ cardTypes: ["unit"], energy: 5, quantity: 3 }),
    ];
    const keys = defaultOddsGroupKeys(cards, oddsGroupPresets(cards, TYPE_LABELS));
    expect(keys).toContain("turn-one-first-unit");
    expect(keys).toContain("combat-trick");
  });

  it("drops a core preset that matches nothing", () => {
    const cards = [main({ cardTypes: ["unit"], energy: 5, quantity: 8 })];
    const keys = defaultOddsGroupKeys(cards, oddsGroupPresets(cards, TYPE_LABELS));
    expect(keys).not.toContain("turn-one-first-unit");
    expect(keys).not.toContain("combat-trick");
  });

  it("counts gear as a turn-1 play", () => {
    const cards = [
      main({ cardTypes: ["gear"], energy: 2, quantity: 3 }),
      main({ cardTypes: ["unit"], energy: 4, quantity: 4 }),
    ];
    const presets = oddsGroupPresets(cards, TYPE_LABELS);
    const turnOne = presets.find((preset) => preset.key === "turn-one-first");
    expect(turnOne).toBeDefined();
    const row = oddsGroupRow(cards, turnOne ?? { key: "x", label: "x" });
    expect(row.copies).toBe(3);
  });

  it("adapts to the deck: a meaningful gear slice earns its row", () => {
    const cards = [
      main({ cardTypes: ["gear"], energy: 2, quantity: 8 }),
      main({ cardTypes: ["unit"], energy: 3, quantity: 21 }),
      main({ cardTypes: ["unit"], energy: 1, quantity: 10 }),
    ];
    const keys = defaultOddsGroupKeys(cards, oddsGroupPresets(cards, TYPE_LABELS));
    expect(keys).toContain("type-gear");
    expect(keys.length).toBeLessThanOrEqual(4);
  });

  it("returns nothing for an empty main deck", () => {
    expect(defaultOddsGroupKeys([], oddsGroupPresets([], TYPE_LABELS))).toEqual([]);
  });
});
