import { describe, expect, it } from "vitest";

import { chanceToDraw } from "@/lib/deck-draw-odds";
import type { HandCardLookup, HandOddsGroup } from "@/lib/deck-hand-odds";
import {
  buildExchangePreview,
  buildInHandGroupCounts,
  buildLibraryHitChances,
  shortGroupLabel,
} from "@/lib/deck-hand-odds";
import { stubDeckBuilderCard } from "@/test/factories";

const UNITS = { key: "units", label: "Any Unit", types: ["unit"] };
const CHEAP = { key: "cheap", label: "Turn-1 play (≤2 energy)", energyMax: 2 };

const cards: HandCardLookup = new Map([
  ["u1", stubDeckBuilderCard({ cardId: "u1", cardTypes: ["unit"], energy: 1 })],
  ["u3", stubDeckBuilderCard({ cardId: "u3", cardTypes: ["unit"], energy: 3 })],
  ["s5", stubDeckBuilderCard({ cardId: "s5", cardTypes: ["spell"], energy: 5 })],
]);

const groups: HandOddsGroup[] = [
  { def: UNITS, copies: 20 },
  { def: CHEAP, copies: 10 },
];

describe("shortGroupLabel", () => {
  it("drops a trailing parenthetical gloss", () => {
    expect(shortGroupLabel("Combat trick (Action/Reaction spell)")).toBe("Combat trick");
    expect(shortGroupLabel("Turn-1 unit going first (≤2 energy)")).toBe("Turn-1 unit going first");
  });

  it("leaves a label without one alone", () => {
    expect(shortGroupLabel("Any Unit")).toBe("Any Unit");
    expect(shortGroupLabel("Ramp (Accelerate) payoff")).toBe("Ramp (Accelerate) payoff");
  });
});

describe("buildInHandGroupCounts", () => {
  it("counts every group member in the hand", () => {
    const counts = buildInHandGroupCounts({ hand: ["u1", "u3", "s5"], cards, groups });
    expect(counts.get("units")).toBe(2);
    expect(counts.get("cheap")).toBe(1);
  });

  it("leaves out a group the hand missed", () => {
    const counts = buildInHandGroupCounts({ hand: ["s5", "s5"], cards, groups });
    expect(counts.has("units")).toBe(false);
    expect(counts.size).toBe(0);
  });

  it("ignores a card the deck lookup does not know", () => {
    const counts = buildInHandGroupCounts({ hand: ["u1", "ghost"], cards, groups });
    expect(counts.get("units")).toBe(1);
  });

  it("handles an empty hand", () => {
    expect(buildInHandGroupCounts({ hand: [], cards, groups }).size).toBe(0);
  });
});

describe("buildLibraryHitChances", () => {
  it("counts copies off the library, not the deck list", () => {
    const rows = buildLibraryHitChances({
      library: ["u1", "u3", "s5", "s5"],
      cards,
      groups,
      draws: 1,
    });
    expect(rows[0].copies).toBe(2);
    expect(rows[0].chance).toBeCloseTo(0.5, 12);
    expect(rows[1].copies).toBe(1);
    expect(rows[1].chance).toBeCloseTo(0.25, 12);
  });

  it("improves with more draws", () => {
    const library = ["u1", "s5", "s5", "s5"];
    const one = buildLibraryHitChances({ library, cards, groups, draws: 1 });
    const two = buildLibraryHitChances({ library, cards, groups, draws: 2 });
    expect(two[0].chance).toBeGreaterThan(one[0].chance);
  });

  it("is impossible once the library holds no members", () => {
    const rows = buildLibraryHitChances({ library: ["s5", "s5"], cards, groups, draws: 2 });
    expect(rows[0]).toMatchObject({ copies: 0, chance: 0 });
  });

  it("is certain when every library card matches", () => {
    const rows = buildLibraryHitChances({ library: ["u1", "u3"], cards, groups, draws: 1 });
    expect(rows[0].chance).toBe(1);
  });

  it("handles an empty library", () => {
    const rows = buildLibraryHitChances({ library: [], cards, groups, draws: 1 });
    expect(rows[0]).toMatchObject({ copies: 0, chance: 0 });
  });

  it("returns nothing when no groups are shown", () => {
    expect(buildLibraryHitChances({ library: ["u1"], cards, groups: [], draws: 1 })).toEqual([]);
  });
});

describe("buildExchangePreview", () => {
  it("reports only the groups the kept cards miss", () => {
    const rows = buildExchangePreview({
      kept: ["u3"],
      library: ["u1", "s5", "s5", "s5"],
      cards,
      groups,
      draws: 2,
    });
    expect(rows.map((row) => row.key)).toEqual(["cheap"]);
    expect(rows[0].chance).toBeCloseTo(chanceToDraw(1, 4, 2), 12);
  });

  it("is empty when the kept cards already cover every group", () => {
    const rows = buildExchangePreview({
      kept: ["u1"],
      library: ["u3", "s5"],
      cards,
      groups,
      draws: 1,
    });
    expect(rows).toEqual([]);
  });

  it("reports every group when nothing is kept", () => {
    const rows = buildExchangePreview({
      kept: [],
      library: ["u1", "s5"],
      cards,
      groups,
      draws: 2,
    });
    expect(rows.map((row) => row.key)).toEqual(["units", "cheap"]);
  });
});
