import type { CardmarketStockRow } from "@openrift/shared/cardmarket-stock";
import { describe, expect, it } from "vitest";

import type { CardmarketResolvedRow } from "./cardmarket-stock-resolve.js";
import type { CardmarketSyncEntry } from "./cardmarket-sync-plan.js";
import {
  cardmarketSyncKeyOf,
  isCardmarketSyncActionable,
  observedCountsFromResolved,
  planCardmarketSync,
} from "./cardmarket-sync-plan.js";

function entry(counts: Partial<Omit<CardmarketSyncEntry, "key">> = {}): CardmarketSyncEntry {
  return {
    key: { printingId: "printing-en", conditionSlug: "near-mint", isAltered: false },
    intent: 3,
    observed: 3,
    intentBase: 3,
    observedBase: 3,
    unmanaged: 0,
    ...counts,
  };
}

function planOne(counts: Partial<Omit<CardmarketSyncEntry, "key">> = {}) {
  const [action] = planCardmarketSync([entry(counts)]);
  if (!action) {
    throw new Error("expected one action");
  }
  return action;
}

describe("planCardmarketSync", () => {
  it("proposes nothing when both sides match the last agreed counts", () => {
    const action = planOne();

    expect(action).toMatchObject({ departed: 0, appeared: 0, list: 0, delist: 0 });
    expect(isCardmarketSyncActionable(action)).toBe(false);
  });

  it("reports a departure without proposing a replacement listing", () => {
    const action = planOne({ observed: 2 });

    expect(action).toMatchObject({ departed: 1, list: 0, delist: 0 });
  });

  it("lists copies that became tradeable", () => {
    const action = planOne({ intent: 5 });

    expect(action).toMatchObject({ list: 2, delist: 0, departed: 0 });
  });

  it("delists copies that stopped being tradeable", () => {
    const action = planOne({ intent: 2 });

    expect(action).toMatchObject({ delist: 1, list: 0, departed: 0 });
  });

  it("separates a sale from a copy moved out of the tradelist in the same pull", () => {
    const action = planOne({ intent: 2, observed: 2 });

    expect(action).toMatchObject({ departed: 1, delist: 1, list: 0 });
  });

  it("never proposes deleting articles the seller listed by hand", () => {
    const action = planOne({ observed: 5, unmanaged: 2 });

    expect(action).toMatchObject({ appeared: 2, delist: 0, list: 0 });
  });

  it("reports articles that appeared before they are adopted", () => {
    const action = planOne({ observed: 5 });

    expect(action.appeared).toBe(2);
  });

  it("lists against the managed count only, ignoring an unmanaged surplus", () => {
    const action = planOne({ intent: 4, observed: 5, observedBase: 5, unmanaged: 2 });

    expect(action).toMatchObject({ list: 1, delist: 0, departed: 0, appeared: 0 });
  });

  it("lists the whole intent when nothing is listed yet", () => {
    const action = planOne({ intent: 2, observed: 0, intentBase: 0, observedBase: 0 });

    expect(action).toMatchObject({ list: 2, delist: 0 });
  });

  it("delists everything when the tradelist empties", () => {
    const action = planOne({ intent: 0 });

    expect(action).toMatchObject({ delist: 3, list: 0 });
  });

  it("clamps rather than proposing a negative count when a sale outruns the tradelist", () => {
    const action = planOne({ intent: 1, observed: 0 });

    expect(action).toMatchObject({ departed: 3, list: 0, delist: 0 });
  });

  it("plans each tuple independently", () => {
    const actions = planCardmarketSync([
      entry({ intent: 5 }),
      entry({ observed: 2 }),
      entry({ intent: 3, observed: 3 }),
    ]);

    expect(actions.map((a) => [a.list, a.delist, a.departed])).toEqual([
      [2, 0, 0],
      [0, 0, 1],
      [0, 0, 0],
    ]);
    expect(actions.filter((action) => isCardmarketSyncActionable(action))).toHaveLength(2);
  });
});

function resolvedRow(
  overrides: Partial<CardmarketStockRow> = {},
  printingId = "printing-en",
): CardmarketResolvedRow {
  return {
    row: {
      idProduct: 904_248,
      isFoil: false,
      idLanguage: 1,
      idCondition: 2,
      amount: 1,
      priceCents: 250,
      comment: "",
      isSigned: false,
      isAltered: false,
      ...overrides,
    },
    printingId,
    conditionSlug: "near-mint",
    language: "EN",
  };
}

describe("observedCountsFromResolved", () => {
  it("sums a printing's stock across Cardmarket's duplicate products", () => {
    const counts = observedCountsFromResolved([
      resolvedRow({ idProduct: 904_248, amount: 2 }),
      resolvedRow({ idProduct: 904_249, amount: 3 }),
    ]);

    expect(counts.size).toBe(1);
    expect([...counts.values()][0]?.observed).toBe(5);
  });

  it("keeps altered copies in their own tuple", () => {
    const counts = observedCountsFromResolved([
      resolvedRow({ amount: 2 }),
      resolvedRow({ amount: 1, isAltered: true }),
    ]);

    expect(counts.size).toBe(2);
    expect(
      counts.get(
        cardmarketSyncKeyOf({
          printingId: "printing-en",
          conditionSlug: "near-mint",
          isAltered: true,
        }),
      )?.observed,
    ).toBe(1);
  });

  it("keeps different printings apart", () => {
    const counts = observedCountsFromResolved([
      resolvedRow({ amount: 2 }, "printing-en"),
      resolvedRow({ amount: 4 }, "printing-fr"),
    ]);

    expect(counts.size).toBe(2);
  });

  it("returns nothing for an empty pull", () => {
    expect(observedCountsFromResolved([]).size).toBe(0);
  });
});
