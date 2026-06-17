import type { FriendGroupShareableListResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { ListTargetOption } from "./tradelist-exchange";
import {
  entryForPrinting,
  listTargetOptions,
  offerablePrintings,
  personalCopyIdsByPrinting,
  preferredListId,
} from "./tradelist-exchange";

const EMPTY_PREF = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

function stubShareable(
  overrides: Partial<FriendGroupShareableListResponse> = {},
): FriendGroupShareableListResponse {
  return {
    listId: "list-1",
    listName: "Wishlist",
    listIntent: "wish",
    listKind: "card",
    entryCount: 3,
    sharedAt: null,
    tradeDefaults: EMPTY_PREF,
    currency: null,
    ...overrides,
  };
}

describe("listTargetOptions", () => {
  it("keeps only wish-intent lists for requests, preserving order", () => {
    const options = listTargetOptions(
      [
        stubShareable({ listId: "w1", listIntent: "wish" }),
        stubShareable({ listId: "t1", listIntent: "trade", listKind: "copy" }),
        stubShareable({ listId: "o1", listIntent: "organize" }),
        stubShareable({ listId: "w2", listIntent: "wish", listKind: "printing" }),
      ],
      "wish",
    );
    expect(options.map((option) => option.listId)).toEqual(["w1", "w2"]);
  });

  it("keeps only trade-intent lists for offers", () => {
    const options = listTargetOptions(
      [
        stubShareable({ listId: "w1", listIntent: "wish" }),
        stubShareable({ listId: "t1", listIntent: "trade", listKind: "copy" }),
        stubShareable({ listId: "t2", listIntent: "trade", listKind: "copy" }),
      ],
      "trade",
    );
    expect(options.map((option) => option.listId)).toEqual(["t1", "t2"]);
  });

  it("preserves the raw list kind, including copy for tradelists", () => {
    const [trade] = listTargetOptions(
      [stubShareable({ listIntent: "trade", listKind: "copy" })],
      "trade",
    );
    expect(trade.listKind).toBe("copy");
  });

  it("flags shared lists from sharedAt", () => {
    const [unshared, shared] = listTargetOptions(
      [
        stubShareable({ listId: "w1", sharedAt: null }),
        stubShareable({ listId: "w2", sharedAt: "2026-01-01T00:00:00Z" }),
      ],
      "wish",
    );
    expect(unshared.isShared).toBe(false);
    expect(shared.isShared).toBe(true);
  });

  it("returns an empty array when nothing matches the intent", () => {
    expect(
      listTargetOptions([stubShareable({ listIntent: "trade", listKind: "copy" })], "wish"),
    ).toEqual([]);
  });
});

describe("entryForPrinting", () => {
  const printing = { id: "printing-9", cardId: "card-9" };

  it("keys card-kind lists by card id", () => {
    expect(entryForPrinting("card", printing, 2)).toEqual({ cardId: "card-9", quantity: 2 });
  });

  it("keys printing-kind lists by printing id", () => {
    expect(entryForPrinting("printing", printing, 1)).toEqual({
      printingId: "printing-9",
      quantity: 1,
    });
  });

  it("clamps quantity to a positive integer", () => {
    expect(entryForPrinting("card", printing, 0).quantity).toBe(1);
    expect(entryForPrinting("card", printing, -5).quantity).toBe(1);
    expect(entryForPrinting("card", printing, 2.9).quantity).toBe(2);
  });
});

describe("preferredListId", () => {
  const option = (overrides: Partial<ListTargetOption>): ListTargetOption => ({
    listId: "w",
    listName: "Wishlist",
    listKind: "card",
    entryCount: 0,
    isShared: false,
    ...overrides,
  });

  it("prefers a shared list over an earlier unshared one", () => {
    expect(
      preferredListId([
        option({ listId: "w1", isShared: false }),
        option({ listId: "w2", isShared: true }),
      ]),
    ).toBe("w2");
  });

  it("falls back to the first list when none are shared", () => {
    expect(
      preferredListId([
        option({ listId: "w1", isShared: false }),
        option({ listId: "w2", isShared: false }),
      ]),
    ).toBe("w1");
  });

  it("returns null when there are no options", () => {
    expect(preferredListId([])).toBeNull();
  });
});

describe("personalCopyIdsByPrinting", () => {
  it("groups personal copies by printing and excludes group-owned copies", () => {
    const result = personalCopyIdsByPrinting([
      { id: "c1", printingId: "p1", groupId: null },
      { id: "c2", printingId: "p1", groupId: null },
      { id: "c3", printingId: "p2", groupId: null },
      { id: "c4", printingId: "p1", groupId: "group-1" },
    ]);
    expect(result.get("p1")).toEqual(["c1", "c2"]);
    expect(result.get("p2")).toEqual(["c3"]);
  });

  it("returns an empty map when every copy is group-owned", () => {
    const result = personalCopyIdsByPrinting([{ id: "c1", printingId: "p1", groupId: "g1" }]);
    expect(result.size).toBe(0);
  });
});

describe("offerablePrintings", () => {
  it("keeps only owned candidates, ordered most-owned first", () => {
    const owned = new Map<string, string[]>([
      ["p1", ["c1"]],
      ["p2", ["c2", "c3", "c4"]],
      ["p3", ["c5", "c6"]],
    ]);
    const result = offerablePrintings(["p1", "p2", "p3", "p4"], owned);
    expect(result.map((entry) => entry.printingId)).toEqual(["p2", "p3", "p1"]);
    expect(result[0].copyIds).toEqual(["c2", "c3", "c4"]);
  });

  it("breaks ties on equal counts by printing id", () => {
    const owned = new Map<string, string[]>([
      ["pb", ["c1"]],
      ["pa", ["c2"]],
    ]);
    expect(offerablePrintings(["pb", "pa"], owned).map((entry) => entry.printingId)).toEqual([
      "pa",
      "pb",
    ]);
  });

  it("returns an empty array when the viewer owns none of the candidates", () => {
    expect(offerablePrintings(["p1"], new Map([["p2", ["c1"]]]))).toEqual([]);
  });
});
