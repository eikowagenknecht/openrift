import type { CardTradeResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { MatchSuggestionFields } from "./trade-derivation";
import {
  countTradeSuggestions,
  describeViewerSource,
  groupTradesByCounterparty,
  matchSuggestionKey,
  maxTradeQuantity,
  sumTradeValues,
  tradeSection,
  tradeStatusLabel,
  withoutLiveTradeMatches,
} from "./trade-derivation";

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "the-group",
    role: "receiver",
    initiator: "receiver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    printingId: "printing-1",
    cardId: "card-1",
    quantity: 1,
    status: "pending",
    createdAt: "2026-05-29T10:00:00.000Z",
    updatedAt: "2026-05-29T10:00:00.000Z",
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

describe("tradeSection", () => {
  it("buckets a request awaiting the viewer into action-needed", () => {
    expect(tradeSection(stubTrade({ status: "pending", actionNeeded: "accept-or-decline" }))).toBe(
      "action-needed",
    );
  });

  it("buckets an unresolved completed sync into action-needed", () => {
    expect(tradeSection(stubTrade({ status: "completed", actionNeeded: "apply-sync" }))).toBe(
      "action-needed",
    );
  });

  it("buckets the viewer's own pending request into active", () => {
    expect(tradeSection(stubTrade({ status: "pending", actionNeeded: "cancel" }))).toBe("active");
  });

  it("buckets a reserved trade into active", () => {
    expect(tradeSection(stubTrade({ status: "reserved", actionNeeded: "complete" }))).toBe(
      "active",
    );
  });

  it("buckets a resolved completed trade into history", () => {
    expect(tradeSection(stubTrade({ status: "completed", actionNeeded: null }))).toBe("history");
  });

  it("buckets terminal trades into history", () => {
    for (const status of ["declined", "cancelled", "expired"] as const) {
      expect(tradeSection(stubTrade({ status, actionNeeded: null }))).toBe("history");
    }
  });
});

describe("maxTradeQuantity", () => {
  it("caps at the demand when supply exceeds it (offer more than they want)", () => {
    // They want 1 but you have 5 — you can only trade 1, not 5 (the reported bug).
    expect(maxTradeQuantity(1, 5)).toBe(1);
  });

  it("caps at the available count when demand exceeds supply", () => {
    expect(maxTradeQuantity(5, 3)).toBe(3);
  });

  it("equals the demand when supply covers it", () => {
    expect(maxTradeQuantity(3, 5)).toBe(3);
  });

  it("returns 0 when nothing is available", () => {
    expect(maxTradeQuantity(3, 0)).toBe(0);
  });

  it("handles the single-copy boundary", () => {
    expect(maxTradeQuantity(1, 1)).toBe(1);
  });
});

describe("describeViewerSource", () => {
  it("names the wishlist for an incoming card", () => {
    expect(describeViewerSource("incoming", ["Chase Cards"])).toBe("Your wishlist: Chase Cards");
  });

  it("names the tradelist for an outgoing card", () => {
    expect(describeViewerSource("outgoing", ["Spare Foils"])).toBe("Your tradelist: Spare Foils");
  });

  it("collapses repeated names to a single label", () => {
    expect(describeViewerSource("incoming", ["Chase Cards", "Chase Cards"])).toBe(
      "Your wishlist: Chase Cards",
    );
  });

  it("counts distinct lists when a group spans several", () => {
    expect(describeViewerSource("outgoing", ["Binder A", "Binder B"])).toBe("2 of your tradelists");
  });

  it("returns null when no name is known", () => {
    expect(describeViewerSource("incoming", [])).toBeNull();
    expect(describeViewerSource("incoming", [""])).toBeNull();
  });
});

describe("tradeStatusLabel", () => {
  it("maps each status to a human label", () => {
    expect(tradeStatusLabel("pending")).toBe("Pending");
    expect(tradeStatusLabel("reserved")).toBe("Reserved");
    expect(tradeStatusLabel("completed")).toBe("Completed");
    expect(tradeStatusLabel("declined")).toBe("Declined");
    expect(tradeStatusLabel("cancelled")).toBe("Cancelled");
    expect(tradeStatusLabel("expired")).toBe("Expired");
  });
});

describe("withoutLiveTradeMatches", () => {
  const match = (counterpartyUserId: string, printingId: string) => ({
    counterpartyUserId,
    printingId,
  });

  it("drops a match with a pending trade for the same member + printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "pending",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          contactMethods: [],
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([]);
  });

  it("drops a match with a reserved trade for the same member + printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "reserved",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          contactMethods: [],
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([]);
  });

  it("keeps a match when the live trade is for a different printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [stubTrade({ status: "reserved", printingId: "printing-OTHER" })];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
  });

  it("keeps a match when the live trade is with a different member", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "reserved",
        printingId: "printing-1",
        counterparty: {
          userId: "user-99",
          name: null,
          image: null,
          gravatarHash: "h",
          contactMethods: [],
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
  });

  it("keeps a match when the only matching trade is terminal", () => {
    const matches = [match("user-2", "printing-1")];
    for (const status of ["completed", "declined", "cancelled", "expired"] as const) {
      const trades = [
        stubTrade({
          status,
          printingId: "printing-1",
          counterparty: {
            userId: "user-2",
            name: null,
            image: null,
            gravatarHash: "h",
            contactMethods: [],
          },
        }),
      ];
      expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
    }
  });

  it("returns all matches when there are no trades", () => {
    const matches = [match("user-2", "printing-1"), match("user-3", "printing-2")];
    expect(withoutLiveTradeMatches(matches, [])).toEqual(matches);
  });

  it("filters only the matches with a live trade, keeping the rest", () => {
    const matches = [match("user-2", "printing-1"), match("user-3", "printing-2")];
    const trades = [
      stubTrade({
        status: "pending",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          contactMethods: [],
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([match("user-3", "printing-2")]);
  });
});

function stubSuggestion(overrides: Partial<MatchSuggestionFields> = {}): MatchSuggestionFields {
  return {
    buyEntryKind: "printing",
    buyEntryId: "entry-1",
    cardId: "card-1",
    counterpartyUserId: "user-2",
    counterpartyListId: "list-1",
    printingId: "printing-1",
    ...overrides,
  };
}

describe("matchSuggestionKey", () => {
  it("collapses every printing of a card-level wish from one counterparty into one key", () => {
    const keyA = matchSuggestionKey("incoming", stubSuggestion({ buyEntryKind: "card" }));
    const keyB = matchSuggestionKey(
      "incoming",
      stubSuggestion({ buyEntryKind: "card", printingId: "printing-2", counterpartyListId: "l2" }),
    );
    expect(keyA).toBe(keyB);
  });

  it("keeps printing-level wishes apart per printing and source list", () => {
    const base = stubSuggestion();
    expect(matchSuggestionKey("incoming", base)).not.toBe(
      matchSuggestionKey("incoming", stubSuggestion({ printingId: "printing-2" })),
    );
    expect(matchSuggestionKey("incoming", base)).not.toBe(
      matchSuggestionKey("incoming", stubSuggestion({ counterpartyListId: "list-2" })),
    );
  });

  it("separates the same row by direction and counterparty", () => {
    const base = stubSuggestion();
    expect(matchSuggestionKey("incoming", base)).not.toBe(matchSuggestionKey("outgoing", base));
    expect(matchSuggestionKey("incoming", base)).not.toBe(
      matchSuggestionKey("incoming", stubSuggestion({ counterpartyUserId: "user-3" })),
    );
  });
});

describe("countTradeSuggestions", () => {
  it("returns 0 for no matches", () => {
    expect(countTradeSuggestions([], [])).toBe(0);
  });

  it("counts many copies of the same printing wish as one suggestion", () => {
    const copies = [stubSuggestion(), stubSuggestion(), stubSuggestion()];
    expect(countTradeSuggestions(copies, [])).toBe(1);
  });

  it("counts a card-level wish fillable by several printings as one suggestion", () => {
    const variants = [
      stubSuggestion({ buyEntryKind: "card" }),
      stubSuggestion({ buyEntryKind: "card", printingId: "printing-2" }),
      stubSuggestion({ buyEntryKind: "card", printingId: "printing-3" }),
    ];
    expect(countTradeSuggestions(variants, [])).toBe(1);
  });

  it("counts both directions separately, even for identical rows", () => {
    const row = stubSuggestion();
    expect(countTradeSuggestions([row], [row])).toBe(2);
  });

  it("counts distinct wishes, counterparties, and lists separately", () => {
    const incoming = [
      stubSuggestion(),
      stubSuggestion({ buyEntryId: "entry-2", printingId: "printing-2" }),
      stubSuggestion({ counterpartyUserId: "user-3" }),
      stubSuggestion({ counterpartyListId: "list-2" }),
    ];
    expect(countTradeSuggestions(incoming, [])).toBe(4);
  });
});

function stubCounterparty(userId: string, name: string | null): CardTradeResponse["counterparty"] {
  return { userId, name, image: null, gravatarHash: `${userId}-hash`, contactMethods: [] };
}

describe("groupTradesByCounterparty", () => {
  it("groups trades by counterparty, preserving input order within a group", () => {
    const alice1 = stubTrade({ id: "a1", counterparty: stubCounterparty("alice", "Alice") });
    const alice2 = stubTrade({ id: "a2", counterparty: stubCounterparty("alice", "Alice") });
    const bob = stubTrade({ id: "b1", counterparty: stubCounterparty("bob", "Bob") });

    const groups = groupTradesByCounterparty([alice1, bob, alice2]);

    const alice = groups.find((group) => group.counterparty.userId === "alice");
    expect(alice?.trades.map((trade) => trade.id)).toEqual(["a1", "a2"]);
  });

  it("orders groups by trade count descending, then by name", () => {
    const trades = [
      stubTrade({ id: "z1", counterparty: stubCounterparty("zoe", "Zoe") }),
      stubTrade({ id: "a1", counterparty: stubCounterparty("alice", "Alice") }),
      stubTrade({ id: "a2", counterparty: stubCounterparty("alice", "Alice") }),
      stubTrade({ id: "m1", counterparty: stubCounterparty("mia", "Mia") }),
    ];

    const groups = groupTradesByCounterparty(trades);

    // Alice (2) first; Mia and Zoe (1 each) tie-break alphabetically.
    expect(groups.map((group) => group.counterparty.userId)).toEqual(["alice", "mia", "zoe"]);
  });

  it("returns an empty array for no trades", () => {
    expect(groupTradesByCounterparty([])).toEqual([]);
  });
});

describe("sumTradeValues", () => {
  const price = (map: Record<string, number>) => (printingId: string) => map[printingId];

  it("splits value by direction: receiver into get, giver into give", () => {
    const trades = [
      stubTrade({ role: "receiver", printingId: "p1", quantity: 2 }),
      stubTrade({ role: "giver", printingId: "p2", quantity: 1 }),
    ];

    const split = sumTradeValues(trades, price({ p1: 5, p2: 3 }));

    expect(split).toEqual({ get: 10, give: 3, hasGet: true, hasGive: true });
  });

  it("skips unpriced printings and leaves the flag false when a side is all-unpriced", () => {
    const trades = [
      stubTrade({ role: "receiver", printingId: "p1", quantity: 2 }),
      stubTrade({ role: "receiver", printingId: "p2", quantity: 4 }),
    ];

    const split = sumTradeValues(trades, price({ p1: 5 }));

    // p2 has no price, so only p1 contributes; the give side stays empty.
    expect(split).toEqual({ get: 10, give: 0, hasGet: true, hasGive: false });
  });

  it("returns an all-empty split for no trades", () => {
    expect(sumTradeValues([], price({}))).toEqual({
      get: 0,
      give: 0,
      hasGet: false,
      hasGive: false,
    });
  });
});
