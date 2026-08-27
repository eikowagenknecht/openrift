import type { CardTradeLiveAnnotation, CardTradeResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { MatchCopyDetail, MatchSuggestionFields } from "./trade-derivation";
import {
  bucketMemberTrades,
  collapseTradeAnnotations,
  countTradeSuggestions,
  countTradeSuggestionsBySlug,
  describeCounterpartySource,
  describeViewerSource,
  groupTradeAnnotationsByPrinting,
  groupTradesByCounterparty,
  matchCopyConditionLabel,
  matchSuggestionKey,
  maxTradeQuantity,
  summarizeMatchCopies,
  sumTradeValues,
  tradeGroupKey,
  tradeSection,
  tradesHubSummary,
  tradeStatusLabel,
  withoutLiveTradeMatches,
} from "./trade-derivation";

const CONDITION_LABELS: Record<string, string> = {
  "near-mint": "Near Mint",
  played: "Played",
};

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "the-group",
    groupName: "The Group",
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

  it("buckets the viewer's own pending request into active", () => {
    expect(tradeSection(stubTrade({ status: "pending", actionNeeded: "cancel" }))).toBe("active");
  });

  it("buckets an unsettled reserved trade into action-needed", () => {
    // The groups-list badge counts exactly these in its swap half, so a count
    // the viewer taps always has rows behind it in this section.
    expect(tradeSection(stubTrade({ status: "reserved", actionNeeded: "settle" }))).toBe(
      "action-needed",
    );
  });

  it("keeps a reserved trade the viewer already settled in active", () => {
    // Their half is done and the trade is waiting on the other party, so it is
    // still in flight rather than history.
    expect(tradeSection(stubTrade({ status: "reserved", actionNeeded: null }))).toBe("active");
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

describe("describeCounterpartySource", () => {
  // The mirror of the viewer's noun: a card coming to the viewer sits on the
  // other person's tradelist, one going out sits on their wishlist.
  it("names their tradelist for an incoming card", () => {
    expect(describeCounterpartySource("incoming", ["Spare Foils"])).toBe(
      "Their tradelist: Spare Foils",
    );
  });

  it("names their wishlist for an outgoing card", () => {
    expect(describeCounterpartySource("outgoing", ["Chase Cards"])).toBe(
      "Their wishlist: Chase Cards",
    );
  });

  it("counts distinct lists when a group spans several", () => {
    expect(describeCounterpartySource("incoming", ["Binder A", "Binder B"])).toBe(
      "2 of their tradelists",
    );
  });

  it("returns null when no name is known", () => {
    expect(describeCounterpartySource("outgoing", [])).toBeNull();
    expect(describeCounterpartySource("outgoing", [""])).toBeNull();
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

describe("bucketMemberTrades", () => {
  const forMember = (userId: string, overrides: Partial<CardTradeResponse> = {}) =>
    stubTrade({
      ...overrides,
      counterparty: { userId, name: userId, image: null, gravatarHash: "h", contactMethods: [] },
    });

  it("keeps only the given member's trades", () => {
    const buckets = bucketMemberTrades(
      [
        forMember("alice", { id: "a1", status: "reserved", actionNeeded: "settle" }),
        forMember("bob", { id: "b1", status: "reserved", actionNeeded: "settle" }),
      ],
      "alice",
    );
    expect(buckets.actionNeeded.map((t) => t.id)).toEqual(["a1"]);
  });

  it("surfaces a reserved trade in the active bucket — the case the match overlay dropped", () => {
    // A reserved trade no longer appears as a match (its copies are reserved),
    // so before this it vanished from the member page. It must land in a
    // visible bucket, which is action-needed while the viewer's half is
    // unsettled.
    const buckets = bucketMemberTrades(
      [forMember("alice", { id: "r1", status: "reserved", actionNeeded: "settle" })],
      "alice",
    );
    expect(buckets.actionNeeded.map((t) => t.id)).toEqual(["r1"]);
    expect(buckets.active).toHaveLength(0);
    expect(buckets.history).toHaveLength(0);
  });

  it("splits a member's trades across active / action-needed / history", () => {
    const buckets = bucketMemberTrades(
      [
        forMember("alice", { id: "act", status: "pending", actionNeeded: "cancel" }),
        forMember("alice", { id: "need", status: "pending", actionNeeded: "accept-or-decline" }),
        forMember("alice", { id: "done", status: "completed", actionNeeded: null }),
      ],
      "alice",
    );
    expect(buckets.active.map((t) => t.id)).toEqual(["act"]);
    expect(buckets.actionNeeded.map((t) => t.id)).toEqual(["need"]);
    expect(buckets.history.map((t) => t.id)).toEqual(["done"]);
  });

  it("returns empty buckets when the member has no trades", () => {
    const buckets = bucketMemberTrades([forMember("bob", { id: "b1" })], "alice");
    expect(buckets.active).toHaveLength(0);
    expect(buckets.actionNeeded).toHaveLength(0);
    expect(buckets.history).toHaveLength(0);
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

function stubCounterparty(
  userId: string | null,
  name: string | null,
): CardTradeResponse["counterparty"] {
  return { userId, name, image: null, gravatarHash: `${userId}-hash`, contactMethods: [] };
}

describe("countTradeSuggestionsBySlug", () => {
  it("counts each group on its own, keyed by slug", () => {
    const counts = countTradeSuggestionsBySlug(
      [
        { slug: "tuesday-crew", incoming: [stubSuggestion(), stubSuggestion()], outgoing: [] },
        {
          slug: "store-league",
          incoming: [],
          outgoing: [stubSuggestion({ buyEntryId: "entry-2", printingId: "printing-2" })],
        },
      ],
      [],
    );
    expect(counts.get("tuesday-crew")).toBe(1);
    expect(counts.get("store-league")).toBe(1);
  });

  it("counts a suggestion two groups both reach in both of them", () => {
    const row = stubSuggestion();
    const counts = countTradeSuggestionsBySlug(
      [
        { slug: "tuesday-crew", incoming: [row], outgoing: [] },
        { slug: "store-league", incoming: [row], outgoing: [] },
      ],
      [],
    );
    expect(counts.get("tuesday-crew")).toBe(1);
    expect(counts.get("store-league")).toBe(1);
  });

  it("drops suggestions a live trade has taken over", () => {
    const counts = countTradeSuggestionsBySlug(
      [{ slug: "tuesday-crew", incoming: [stubSuggestion()], outgoing: [] }],
      [
        stubTrade({
          status: "pending",
          printingId: "printing-1",
          counterparty: stubCounterparty("user-2", "Ashe"),
        }),
      ],
    );
    expect(counts.get("tuesday-crew")).toBe(0);
  });

  it("returns no entry for a group with no panels yet", () => {
    expect(countTradeSuggestionsBySlug([], []).get("tuesday-crew")).toBeUndefined();
  });
});

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

  it("keeps two deleted counterparties with different names apart", () => {
    const gone1 = stubTrade({ id: "g1", counterparty: stubCounterparty(null, "Ekko") });
    const gone2 = stubTrade({ id: "g2", counterparty: stubCounterparty(null, "Jinx") });

    const groups = groupTradesByCounterparty([gone1, gone2]);

    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.trades.map((trade) => trade.id)).toSorted()).toEqual([
      "g1",
      "g2",
    ]);
  });
});

describe("tradeGroupKey", () => {
  it("identifies a live group by its id", () => {
    expect(tradeGroupKey(stubTrade({ groupId: "group-7", groupName: "Rift Runners" }))).toBe(
      "group-7",
    );
  });

  it("falls back to the snapshotted name once the group is deleted", () => {
    const key = tradeGroupKey(stubTrade({ groupId: null, groupName: "Rift Runners" }));
    expect(key).not.toBe("group-7");
    expect(key).toContain("Rift Runners");
  });

  it("keeps a deleted group apart from a live one of the same name", () => {
    const live = tradeGroupKey(stubTrade({ groupId: "group-7", groupName: "Rift Runners" }));
    const deleted = tradeGroupKey(stubTrade({ groupId: null, groupName: "Rift Runners" }));
    expect(live).not.toBe(deleted);
  });

  it("tells two deleted groups with different names apart", () => {
    const a = tradeGroupKey(stubTrade({ groupId: null, groupName: "Rift Runners" }));
    const b = tradeGroupKey(stubTrade({ groupId: null, groupName: "Bandle Crew" }));
    expect(a).not.toBe(b);
  });

  it("collapses two deleted groups that shared a name, which is the accepted trade-off", () => {
    // The snapshot keeps only the name, so nothing distinguishes them any more.
    const a = tradeGroupKey(stubTrade({ groupId: null, groupName: "Playtest" }));
    const b = tradeGroupKey(stubTrade({ groupId: null, groupName: "Playtest" }));
    expect(a).toBe(b);
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

describe("tradesHubSummary", () => {
  it("leads with the number of people waiting, not the number of trades", () => {
    expect(tradesHubSummary(3, 48, 8, 3, 7, 20)).toEqual({
      headline: 3,
      sub: "people are waiting on you · 48 to answer · 8 to hand over · 3 to receive · 7 suggestions",
    });
  });

  it("uses singular copy for one person and one suggestion", () => {
    expect(tradesHubSummary(1, 0, 2, 0, 1, 0)).toEqual({
      headline: 1,
      sub: "person is waiting on you · 2 to hand over · 1 suggestion",
    });
  });

  it("omits the zero tails", () => {
    expect(tradesHubSummary(2, 5, 0, 0, 0, 0).sub).toBe("people are waiting on you · 5 to answer");
    expect(tradesHubSummary(2, 0, 0, 1, 0, 0).sub).toBe("people are waiting on you · 1 to receive");
    expect(tradesHubSummary(2, 0, 0, 0, 0, 0).sub).toBe("people are waiting on you");
  });

  it("falls back to the match count when nobody is waiting on the viewer", () => {
    expect(tradesHubSummary(0, 0, 0, 0, 1, 0)).toEqual({
      headline: 1,
      sub: "possible trade · none waiting on you",
    });
    expect(tradesHubSummary(0, 0, 0, 0, 4, 2)).toEqual({
      headline: 4,
      sub: "possible trades · none waiting on you",
    });
  });

  it("distinguishes no-matches from no-trades-at-all when both counts are zero", () => {
    expect(tradesHubSummary(0, 0, 0, 0, 0, 2).sub).toBe("no new matches right now");
    expect(tradesHubSummary(0, 0, 0, 0, 0, 0).sub).toBe("no open trades right now");
  });
});

describe("matchCopyConditionLabel and summarizeMatchCopies", () => {
  const LABELS = {
    conditions: CONDITION_LABELS,
    graders: { psa: "PSA" },
  };
  const copy = (overrides: Partial<MatchCopyDetail> = {}): MatchCopyDetail => ({
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    ...overrides,
  });
  const labelOf = (detail: MatchCopyDetail) => matchCopyConditionLabel(detail, LABELS);

  it("labels a graded copy by grader + grade and a raw copy by condition", () => {
    expect(labelOf(copy({ grader: "psa", grade: 9.5 }))).toBe("PSA 9.5");
    expect(labelOf(copy({ condition: "near-mint" }))).toBe("Near Mint");
    expect(labelOf(copy())).toBeNull();
  });

  it("returns no summary for an all-unrecorded stack", () => {
    expect(summarizeMatchCopies([copy(), copy()], labelOf)).toEqual({
      conditions: null,
      notes: [],
    });
  });

  it("counts repeated labels and singles out unique ones, grades included", () => {
    expect(
      summarizeMatchCopies(
        [
          copy({ condition: "near-mint" }),
          copy({ condition: "near-mint" }),
          copy({ grader: "psa", grade: 9 }),
        ],
        labelOf,
      ).conditions,
    ).toBe("Near Mint ×2 · PSA 9");
  });

  it("appends unrecorded copies only when they sit next to recorded ones", () => {
    expect(
      summarizeMatchCopies([copy({ condition: "played" }), copy(), copy()], labelOf).conditions,
    ).toBe("Played · not recorded ×2");
  });

  it("dedupes public notes and drops empty or whitespace-only ones", () => {
    expect(
      summarizeMatchCopies(
        [
          copy({ notesPublic: "corner wear" }),
          copy({ notesPublic: "corner wear" }),
          copy({ notesPublic: "  " }),
          copy({ notesPublic: "shiny back" }),
        ],
        labelOf,
      ).notes,
    ).toEqual(["corner wear", "shiny back"]);
  });

  it("handles an empty copies array", () => {
    expect(summarizeMatchCopies([], labelOf)).toEqual({ conditions: null, notes: [] });
  });
});

// ---------------------------------------------------------------------------
// groupTradeAnnotationsByPrinting / collapseTradeAnnotations
// ---------------------------------------------------------------------------

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "printing-1",
    role: "giver",
    phase: "asked",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("groupTradeAnnotationsByPrinting", () => {
  it("returns an empty map for no annotations", () => {
    expect(groupTradeAnnotationsByPrinting([]).size).toBe(0);
  });

  it("keys by printing id", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ printingId: "printing-1" }),
      annotation({ printingId: "printing-2" }),
    ]);
    expect([...map.keys()]).toEqual(["printing-1", "printing-2"]);
  });

  // uq_card_trades_live is per (group, giver, receiver, printing), so one
  // printing genuinely carries several live trades in different phases.
  it("keeps every annotation on one printing, in input order", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ phase: "asked", tradeCount: 2 }),
      annotation({ phase: "reserved" }),
      annotation({ phase: "offered" }),
    ]);
    expect(map.get("printing-1")?.map((entry) => entry.phase)).toEqual([
      "asked",
      "reserved",
      "offered",
    ]);
  });

  // Accepting a trade pins the copies away, which raises the same card's
  // shortfall on a netOwned wish rule and can open a request for it. Both
  // annotations are real; showing "Reserved" and "Requested" together is not.
  it("drops the receiver side when the same printing also has a giver side", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ role: "receiver", phase: "asked" }),
      annotation({ role: "giver", phase: "reserved" }),
    ]);
    expect(map.get("printing-1")).toEqual([annotation({ role: "giver", phase: "reserved" })]);
  });

  it("keeps a receiver-only printing untouched", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ role: "receiver", phase: "offered" }),
      annotation({ role: "receiver", phase: "asked" }),
    ]);
    expect(map.get("printing-1")).toHaveLength(2);
  });

  it("suppresses per printing, not across the whole list", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ printingId: "printing-1", role: "giver", phase: "reserved" }),
      annotation({ printingId: "printing-1", role: "receiver", phase: "asked" }),
      annotation({ printingId: "printing-2", role: "receiver", phase: "asked" }),
    ]);
    expect(map.get("printing-1")?.map((entry) => entry.role)).toEqual(["giver"]);
    expect(map.get("printing-2")?.map((entry) => entry.role)).toEqual(["receiver"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      annotation({ role: "receiver", phase: "asked" }),
      annotation({ role: "giver", phase: "reserved" }),
    ];
    groupTradeAnnotationsByPrinting(input);
    expect(input).toHaveLength(2);
  });
});

describe("collapseTradeAnnotations", () => {
  it("returns null for an empty list", () => {
    expect(collapseTradeAnnotations([])).toBeNull();
  });

  it("returns the only annotation unchanged", () => {
    expect(collapseTradeAnnotations([annotation({ phase: "offered", quantity: 3 })])).toEqual(
      annotation({ phase: "offered", quantity: 3 }),
    );
  });

  it("picks reserved over offered and asked, the top of the ladder", () => {
    expect(
      collapseTradeAnnotations([
        annotation({ phase: "asked" }),
        annotation({ phase: "offered" }),
        annotation({ phase: "reserved" }),
      ])?.phase,
    ).toBe("reserved");
  });

  it("picks reserved over offered and asked", () => {
    expect(
      collapseTradeAnnotations([
        annotation({ phase: "offered" }),
        annotation({ phase: "asked" }),
        annotation({ phase: "reserved" }),
      ])?.phase,
    ).toBe("reserved");
  });

  it("picks offered over asked", () => {
    expect(
      collapseTradeAnnotations([annotation({ phase: "asked" }), annotation({ phase: "offered" })])
        ?.phase,
    ).toBe("offered");
  });

  // The chip must not overstate what is committed: one reserved copy behind two
  // asked-for ones is one copy committed, not three.
  it("keeps the winning bucket's own counts rather than summing the side", () => {
    expect(
      collapseTradeAnnotations([
        annotation({ phase: "asked", tradeCount: 2, quantity: 3 }),
        annotation({ phase: "reserved", tradeCount: 1, quantity: 4 }),
      ]),
    ).toEqual(annotation({ phase: "reserved", tradeCount: 1, quantity: 4 }));
  });

  // Callers should suppress first, but a mixed list must never report copies
  // going out together with copies coming in.
  it("reports only the winning side when both are present", () => {
    expect(
      collapseTradeAnnotations([
        annotation({ role: "giver", phase: "reserved", tradeCount: 1, quantity: 2 }),
        annotation({ role: "receiver", phase: "asked", tradeCount: 5, quantity: 9 }),
      ]),
    ).toEqual(annotation({ role: "giver", phase: "reserved", tradeCount: 1, quantity: 2 }));
  });

  it("prefers the viewer's own copies when both sides sit at the same phase", () => {
    expect(
      collapseTradeAnnotations([
        annotation({ role: "receiver", phase: "reserved" }),
        annotation({ role: "giver", phase: "reserved" }),
      ])?.role,
    ).toBe("giver");
  });

  it("collapses each printing of a grouped map independently", () => {
    const map = groupTradeAnnotationsByPrinting([
      annotation({ printingId: "printing-1", phase: "asked", tradeCount: 2, quantity: 2 }),
      annotation({ printingId: "printing-1", phase: "reserved", tradeCount: 1, quantity: 1 }),
      annotation({ printingId: "printing-2", role: "receiver", phase: "offered", quantity: 6 }),
    ]);
    expect(collapseTradeAnnotations(map.get("printing-1") ?? [])).toEqual(
      annotation({ printingId: "printing-1", phase: "reserved", tradeCount: 1, quantity: 1 }),
    );
    expect(collapseTradeAnnotations(map.get("printing-2") ?? [])).toEqual(
      annotation({ printingId: "printing-2", role: "receiver", phase: "offered", quantity: 6 }),
    );
  });
});
