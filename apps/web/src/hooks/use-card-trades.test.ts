import type { CardTradeLiveAnnotation } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { aggregateIncomingTradeCounts } from "./use-card-trades";

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "printing-1",
    role: "receiver",
    phase: "reserved",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("aggregateIncomingTradeCounts", () => {
  it("returns an empty map for no annotations", () => {
    expect(aggregateIncomingTradeCounts([])).toEqual({});
  });

  it("counts reserved trades where the viewer receives", () => {
    expect(aggregateIncomingTradeCounts([annotation({ quantity: 2 })])).toEqual({
      "printing-1": 2,
    });
  });

  it("sums several reserved trades on one printing into one incoming count", () => {
    const counts = aggregateIncomingTradeCounts([
      annotation({ quantity: 1 }),
      annotation({ quantity: 3 }),
    ]);

    expect(counts).toEqual({ "printing-1": 4 });
  });

  it("ignores the giver side, already tracked as lockedReserved on the copies", () => {
    expect(aggregateIncomingTradeCounts([annotation({ role: "giver", quantity: 2 })])).toEqual({});
  });

  it("ignores phases before reserve, since nothing is pinned yet", () => {
    expect(
      aggregateIncomingTradeCounts([
        annotation({ phase: "asked", quantity: 2 }),
        annotation({ phase: "offered", quantity: 5 }),
      ]),
    ).toEqual({});
  });

  it("keeps printings apart and drops the phases it does not count", () => {
    const counts = aggregateIncomingTradeCounts([
      annotation({ printingId: "a", quantity: 2 }),
      annotation({ printingId: "b", quantity: 1 }),
      annotation({ printingId: "b", phase: "offered", quantity: 9 }),
      annotation({ printingId: "c", role: "giver", quantity: 4 }),
    ]);

    expect(counts).toEqual({ a: 2, b: 1 });
  });
});
