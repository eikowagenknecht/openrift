import type { CardTradeResponse, FriendGroupShareableListResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { ListTargetOption } from "./tradelist-exchange";
import {
  entryForPrinting,
  listKindNoun,
  listTargetOptions,
  offerablePrintings,
  pendingRequestsByPrinting,
  personalCopyIdsByPrinting,
  preferredListId,
  requestListKind,
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
    hasRule: false,
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

describe("listKindNoun", () => {
  it("uses the singular noun when the count is exactly one", () => {
    expect(listKindNoun("card", 1)).toBe("card");
    expect(listKindNoun("printing", 1)).toBe("printing");
    expect(listKindNoun("copy", 1)).toBe("copy");
  });

  it("uses the plural noun for zero or many", () => {
    expect(listKindNoun("card", 0)).toBe("cards");
    expect(listKindNoun("printing", 3)).toBe("printings");
    expect(listKindNoun("copy", 2)).toBe("copies");
  });
});

describe("requestListKind", () => {
  const option = (kind: ListTargetOption["listKind"]): ListTargetOption => ({
    listId: "w",
    listName: "Wishlist",
    listKind: kind,
    entryCount: 0,
    isShared: false,
  });

  it("makes a new wishlist printing-kind so it matches only the requested printing", () => {
    // Regression: a new wishlist used to be created card-kind, which matched
    // every printing of the card and surfaced far more matches than intended.
    expect(requestListKind(undefined)).toBe("printing");
  });

  it("keeps a printing-kind chosen list as printing", () => {
    expect(requestListKind(option("printing"))).toBe("printing");
  });

  it("keeps a card-kind chosen list as card", () => {
    expect(requestListKind(option("card"))).toBe("card");
  });

  it("narrows an unexpected copy-kind chosen list to card", () => {
    expect(requestListKind(option("copy"))).toBe("card");
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

describe("pendingRequestsByPrinting", () => {
  function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
    return {
      id: "trade-1",
      groupId: "group-1",
      groupSlug: "my-group",
      role: "receiver",
      initiator: "receiver",
      counterparty: {
        userId: "member-1",
        name: "Member",
        image: null,
        gravatarHash: "hash",
        contactMethods: [],
      },
      printingId: "p1",
      cardId: "card-1",
      quantity: 1,
      status: "pending",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      acceptedAt: null,
      completedAt: null,
      closedAt: null,
      expiresAt: null,
      viewerSyncAppliedAt: null,
      counterpartySyncAppliedAt: null,
      actionNeeded: null,
      ...overrides,
    };
  }

  it("maps each printing to its pending request's trade id and quantity", () => {
    const result = pendingRequestsByPrinting(
      [
        stubTrade({ id: "t1", printingId: "p1", quantity: 2 }),
        stubTrade({ id: "t2", printingId: "p2", quantity: 1 }),
      ],
      "my-group",
      "member-1",
    );
    expect(result.get("p1")).toEqual({ tradeId: "t1", quantity: 2 });
    expect(result.get("p2")).toEqual({ tradeId: "t2", quantity: 1 });
  });

  it("excludes reserved requests (their copies are pinned and marked separately)", () => {
    const result = pendingRequestsByPrinting(
      [stubTrade({ printingId: "p1", status: "reserved" })],
      "my-group",
      "member-1",
    );
    expect(result.size).toBe(0);
  });

  it("excludes terminal statuses so a resolved request clears the marker", () => {
    const result = pendingRequestsByPrinting(
      [
        stubTrade({ printingId: "p1", status: "declined" }),
        stubTrade({ printingId: "p2", status: "cancelled" }),
        stubTrade({ printingId: "p3", status: "expired" }),
        stubTrade({ printingId: "p4", status: "completed" }),
      ],
      "my-group",
      "member-1",
    );
    expect(result.size).toBe(0);
  });

  it("excludes trades where the viewer is the giver, not the requester", () => {
    const result = pendingRequestsByPrinting(
      [stubTrade({ printingId: "p1", role: "giver" })],
      "my-group",
      "member-1",
    );
    expect(result.size).toBe(0);
  });

  it("scopes to the given group and counterparty", () => {
    const result = pendingRequestsByPrinting(
      [
        stubTrade({ printingId: "p1", groupSlug: "other-group" }),
        stubTrade({
          printingId: "p2",
          counterparty: {
            userId: "member-2",
            name: "Other",
            image: null,
            gravatarHash: "hash2",
            contactMethods: [],
          },
        }),
        stubTrade({ id: "t3", printingId: "p3", quantity: 4 }),
      ],
      "my-group",
      "member-1",
    );
    expect([...result.keys()]).toEqual(["p3"]);
    expect(result.get("p3")).toEqual({ tradeId: "t3", quantity: 4 });
  });

  it("returns an empty map when there are no trades", () => {
    expect(pendingRequestsByPrinting([], "my-group", "member-1").size).toBe(0);
  });
});
