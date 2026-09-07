import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import type { MetaDeckCost } from "./meta-deck-collection";
import type { StandingsCostBounds } from "./meta-standings-cost";
import {
  costMatchesBounds,
  countStandingsUnderCost,
  highestStandingsCost,
  isCostFilterActive,
} from "./meta-standings-cost";

const ANY: StandingsCostBounds = { maxCost: null, valueRange: { min: null, max: null } };

const OWNED: MetaDeckCost = { needed: 40, owned: 40, value: 120, toComplete: 0 };
const PARTLY_OWNED: MetaDeckCost = { needed: 40, owned: 20, value: 60, toComplete: 25 };
const UNPRICED: MetaDeckCost = { needed: 40, owned: 0, value: undefined, toComplete: undefined };
const SIGNED_OUT: MetaDeckCost = {
  needed: 40,
  owned: undefined,
  value: 200,
  toComplete: undefined,
};

function player(overrides: Partial<MetaEventPlayer> = {}): MetaEventPlayer {
  return {
    id: "p-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Ana",
    playerKey: "u1001",
    wins: 6,
    losses: 1,
    draws: null,
    legend: null,
    champion: null,
    deckId: null,
    deckName: null,
    shareToken: null,
    listStatus: "none",
    ...overrides,
  };
}

const FIELD: MetaEventPlayer[] = [
  player({ id: "p-1", playerName: "Ana", deckId: "owned", shareToken: "tok1" }),
  player({ id: "p-2", playerName: "Bo", rank: 2, deckId: "partly", shareToken: "tok2" }),
  player({ id: "p-3", playerName: "Cy", rank: 3, deckId: "unpriced", shareToken: "tok3" }),
  player({ id: "p-4", playerName: "Dee", rank: 4 }),
];

const COSTS = new Map<string, MetaDeckCost>([
  ["owned", OWNED],
  ["partly", PARTLY_OWNED],
  ["unpriced", UNPRICED],
  ["elsewhere", { needed: 40, owned: 0, value: 900, toComplete: 900 }],
]);

describe("isCostFilterActive", () => {
  it("is inactive when neither axis carries a bound", () => {
    expect(isCostFilterActive(ANY)).toBe(false);
  });

  it("is active on a cost bound alone", () => {
    expect(isCostFilterActive({ ...ANY, maxCost: 0 })).toBe(true);
  });

  it("is active on either end of the value range alone", () => {
    expect(isCostFilterActive({ ...ANY, valueRange: { min: 10, max: null } })).toBe(true);
    expect(isCostFilterActive({ ...ANY, valueRange: { min: null, max: 10 } })).toBe(true);
  });
});

describe("costMatchesBounds", () => {
  it("keeps everything while no bound is set, an unpriced list included", () => {
    expect(costMatchesBounds(UNPRICED, ANY)).toBe(true);
    expect(costMatchesBounds(undefined, ANY)).toBe(true);
  });

  it("rejects a list the archive has not priced once any bound is set", () => {
    expect(costMatchesBounds(undefined, { ...ANY, maxCost: 50 })).toBe(false);
    expect(costMatchesBounds(undefined, { ...ANY, valueRange: { min: null, max: 50 } })).toBe(
      false,
    );
  });

  it("keeps a list whose cost to complete is at or under the bound", () => {
    expect(costMatchesBounds(PARTLY_OWNED, { ...ANY, maxCost: 25 })).toBe(true);
    expect(costMatchesBounds(PARTLY_OWNED, { ...ANY, maxCost: 24 })).toBe(false);
  });

  it("keeps only the lists that cost nothing to complete at a bound of zero", () => {
    expect(costMatchesBounds(OWNED, { ...ANY, maxCost: 0 })).toBe(true);
    expect(costMatchesBounds(PARTLY_OWNED, { ...ANY, maxCost: 0 })).toBe(false);
  });

  it("rejects a list whose cost to complete is unknown, whatever the bound", () => {
    expect(costMatchesBounds(UNPRICED, { ...ANY, maxCost: 1000 })).toBe(false);
    expect(costMatchesBounds(UNPRICED, { ...ANY, maxCost: 0 })).toBe(false);
  });

  it("rejects every list for a reader with no collection loaded, since nothing has a cost to complete", () => {
    expect(costMatchesBounds(SIGNED_OUT, { ...ANY, maxCost: 1000 })).toBe(false);
  });

  it("prices a signed-out reader's list for the value range all the same", () => {
    expect(costMatchesBounds(SIGNED_OUT, { ...ANY, valueRange: { min: null, max: 300 } })).toBe(
      true,
    );
  });

  it("holds a value inside the range and drops it outside either end", () => {
    const range = { ...ANY, valueRange: { min: 50, max: 150 } };
    expect(costMatchesBounds(PARTLY_OWNED, range)).toBe(true);
    expect(costMatchesBounds(OWNED, range)).toBe(true);
    expect(costMatchesBounds({ ...OWNED, value: 200 }, range)).toBe(false);
    expect(costMatchesBounds({ ...OWNED, value: 10 }, range)).toBe(false);
  });

  it("takes the ends of the range as inclusive", () => {
    const range = { ...ANY, valueRange: { min: 60, max: 60 } };
    expect(costMatchesBounds(PARTLY_OWNED, range)).toBe(true);
  });

  it("rejects a list with no value against a value bound", () => {
    expect(costMatchesBounds(UNPRICED, { ...ANY, valueRange: { min: null, max: 1000 } })).toBe(
      false,
    );
  });

  it("requires both axes when both are bounded", () => {
    const both: StandingsCostBounds = { maxCost: 25, valueRange: { min: null, max: 50 } };
    expect(costMatchesBounds(PARTLY_OWNED, both)).toBe(false);
    expect(costMatchesBounds({ ...PARTLY_OWNED, value: 40 }, both)).toBe(true);
  });
});

describe("countStandingsUnderCost", () => {
  it("counts every entry with a list while the swapped bound leaves the filter inert", () => {
    expect(countStandingsUnderCost(FIELD, COSTS, ANY, null)).toBe(3);
  });

  it("counts what a bound would leave rather than what is on screen now", () => {
    expect(countStandingsUnderCost(FIELD, COSTS, { ...ANY, maxCost: 0 }, 25)).toBe(2);
  });

  it("keeps the value range applied while the cost bound is swapped", () => {
    const bounds = { ...ANY, valueRange: { min: null, max: 100 } };
    expect(countStandingsUnderCost(FIELD, COSTS, bounds, null)).toBe(1);
  });

  it("never counts an entry with no list", () => {
    expect(countStandingsUnderCost([player()], COSTS, ANY, null)).toBe(0);
  });

  it("counts nothing before the prices are in", () => {
    expect(countStandingsUnderCost(FIELD, undefined, ANY, 25)).toBe(0);
  });
});

describe("highestStandingsCost", () => {
  it("takes the ceiling from this event's lists, not the whole archive", () => {
    expect(highestStandingsCost(FIELD, COSTS, (cost) => cost.value)).toBe(120);
    expect(highestStandingsCost(FIELD, COSTS, (cost) => cost.toComplete)).toBe(25);
  });

  it("has no ceiling when the field holds nothing the picker can read", () => {
    expect(highestStandingsCost(FIELD, COSTS, () => undefined)).toBeUndefined();
    expect(highestStandingsCost([player()], COSTS, (cost) => cost.value)).toBeUndefined();
  });

  it("has no ceiling before the prices are in", () => {
    expect(highestStandingsCost(FIELD, undefined, (cost) => cost.value)).toBeUndefined();
  });

  it("reads a zero ceiling as a figure rather than as nothing", () => {
    const field = [player({ deckId: "owned", shareToken: "tok1" })];
    expect(highestStandingsCost(field, COSTS, (cost) => cost.toComplete)).toBe(0);
  });
});
