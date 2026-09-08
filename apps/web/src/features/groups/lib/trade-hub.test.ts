import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
import { describe, expect, it } from "vitest";

import type { MatchSuggestionFields } from "./trade-derivation";
import {
  buildTradeHubCards,
  buildTradeShelf,
  expiringSoonCount,
  isQuietTradeHubCard,
  needsYouCounts,
  needsYouLine,
  sortNeedsYou,
  suggestionsLine,
} from "./trade-hub";

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "summoner-skirmish",
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
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
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

function stubMatch(overrides: Partial<MatchSuggestionFields> = {}): MatchSuggestionFields {
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

function ids(trades: CardTradeResponse[]): string[] {
  return trades.map((trade) => trade.id);
}

describe("needsYouCounts", () => {
  it("counts the three acts apart: answer, hand over, receive", () => {
    expect(
      needsYouCounts([
        stubTrade({ actionNeeded: "accept-or-decline" }),
        stubTrade({ actionNeeded: "accept-or-decline" }),
        stubTrade({ actionNeeded: "settle", role: "giver" }),
        stubTrade({ actionNeeded: "settle", role: "receiver" }),
        stubTrade({ actionNeeded: "settle", role: "receiver" }),
      ]),
    ).toEqual({ toAnswer: 2, toHandOver: 1, toReceive: 2 });
  });

  it("ignores anything that isn't waiting on the viewer", () => {
    expect(
      needsYouCounts([stubTrade({ actionNeeded: "cancel" }), stubTrade({ actionNeeded: null })]),
    ).toEqual({ toAnswer: 0, toHandOver: 0, toReceive: 0 });
  });

  it("counts nothing for no trades", () => {
    expect(needsYouCounts([])).toEqual({ toAnswer: 0, toHandOver: 0, toReceive: 0 });
  });
});

describe("needsYouLine", () => {
  const NOW = new Date("2026-08-01T12:00:00.000Z");

  it("returns null when nothing needs the viewer", () => {
    expect(needsYouLine([], NOW)).toBeNull();
  });

  it("lists each stage in order, then the expiry warning", () => {
    const rows = [
      stubTrade({
        id: "a",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-02T12:00:00.000Z",
      }),
      stubTrade({ id: "b", actionNeeded: "settle", role: "giver" }),
      stubTrade({ id: "c", actionNeeded: "settle", role: "receiver" }),
      stubTrade({ id: "d", actionNeeded: "settle", role: "receiver" }),
    ];
    expect(needsYouLine(rows, NOW)).toBe(
      "1 to answer, 1 to hand over, 2 to confirm · 1 expires soon",
    );
  });

  it("omits the expiry warning for open-ended requests", () => {
    expect(needsYouLine([stubTrade({ actionNeeded: "accept-or-decline" })], NOW)).toBe(
      "1 to answer",
    );
  });
});

describe("expiringSoonCount", () => {
  const NOW = new Date("2026-08-01T12:00:00.000Z");

  function request(expiresAt: string | null): CardTradeResponse {
    return stubTrade({ actionNeeded: "accept-or-decline", expiresAt });
  }

  it("counts the requests running out inside the window", () => {
    const rows = [
      request("2026-08-02T12:00:00.000Z"),
      request("2026-08-03T11:00:00.000Z"),
      request("2026-08-05T12:00:00.000Z"),
    ];
    expect(expiringSoonCount(rows, NOW)).toBe(2);
  });

  it("counts a deadline that has already passed", () => {
    expect(expiringSoonCount([request("2026-07-30T12:00:00.000Z")], NOW)).toBe(1);
  });

  it("skips open-ended requests and every swap awaiting a settle", () => {
    const rows = [
      request(null),
      stubTrade({ actionNeeded: "settle", expiresAt: "2026-08-01T13:00:00.000Z" }),
    ];
    expect(expiringSoonCount(rows, NOW)).toBe(0);
  });
});

describe("sortNeedsYou", () => {
  it("leads with the requests, soonest deadline first", () => {
    const sorted = sortNeedsYou([
      stubTrade({
        id: "later",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-09T10:00:00.000Z",
      }),
      stubTrade({
        id: "sooner",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-03T10:00:00.000Z",
      }),
    ]);
    expect(ids(sorted)).toEqual(["sooner", "later"]);
  });

  it("puts a request with no deadline behind the ones that expire", () => {
    const sorted = sortNeedsYou([
      stubTrade({ id: "open-ended", actionNeeded: "accept-or-decline", expiresAt: null }),
      stubTrade({
        id: "expiring",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-20T10:00:00.000Z",
      }),
    ]);
    expect(ids(sorted)).toEqual(["expiring", "open-ended"]);
  });

  it("puts every settle behind every request, newest settle first", () => {
    const sorted = sortNeedsYou([
      stubTrade({
        id: "old-settle",
        actionNeeded: "settle",
        updatedAt: "2026-08-01T10:00:00.000Z",
      }),
      stubTrade({
        id: "new-settle",
        actionNeeded: "settle",
        updatedAt: "2026-08-05T10:00:00.000Z",
      }),
      stubTrade({ id: "request", actionNeeded: "accept-or-decline", expiresAt: null }),
    ]);
    expect(ids(sorted)).toEqual(["request", "new-settle", "old-settle"]);
  });

  it("leaves the input untouched", () => {
    const trades = [
      stubTrade({ id: "settle", actionNeeded: "settle" }),
      stubTrade({ id: "request", actionNeeded: "accept-or-decline" }),
    ];
    sortNeedsYou(trades);
    expect(ids(trades)).toEqual(["settle", "request"]);
  });

  it("returns nothing for no trades", () => {
    expect(sortNeedsYou([])).toEqual([]);
  });
});

const VIEWER = "user-1";

function cardIds(cards: { member: { userId: string } }[]): string[] {
  return cards.map((card) => card.member.userId);
}

function buildCards(
  overrides: Partial<Parameters<typeof buildTradeHubCards>[0]> = {},
): ReturnType<typeof buildTradeHubCards> {
  return buildTradeHubCards({
    viewerId: VIEWER,
    groupId: "group-1",
    members: [
      { userId: VIEWER, userName: "You" },
      { userId: "user-2", userName: "Robin" },
    ],
    groupTrades: [],
    allTrades: [],
    incoming: [],
    outgoing: [],
    elsewhereIncoming: [],
    elsewhereOutgoing: [],
    shares: [],
    ...overrides,
  });
}

describe("buildTradeHubCards", () => {
  it("gives every member but the viewer a card", () => {
    expect(cardIds(buildCards())).toEqual(["user-2"]);
  });

  it("splits a member's trades into what waits on the viewer and what doesn't", () => {
    const card = buildCards({
      groupTrades: [
        stubTrade({ id: "mine", actionNeeded: "accept-or-decline" }),
        stubTrade({ id: "theirs", actionNeeded: "cancel" }),
        stubTrade({ id: "reserved", status: "reserved", actionNeeded: null }),
        stubTrade({ id: "done", status: "completed" }),
      ],
    })[0]!;

    expect(ids(card.needsYou)).toEqual(["mine"]);
    expect(ids(card.open)).toEqual(["theirs", "reserved"]);
    expect(card.tradedCount).toBe(1);
    expect(card.trades).toHaveLength(4);
  });

  it("does not count a reservation the viewer already settled as waiting on them", () => {
    const card = buildCards({
      groupTrades: [
        stubTrade({
          id: "settled-by-me",
          status: "reserved",
          actionNeeded: null,
          viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z",
        }),
        stubTrade({ id: "still-theirs", status: "reserved", actionNeeded: null }),
      ],
    })[0]!;

    expect(ids(card.open)).toEqual(["still-theirs"]);
  });

  it("counts a viewer-settled reservation as traded", () => {
    const card = buildCards({
      groupTrades: [
        stubTrade({
          id: "settled-by-me",
          status: "reserved",
          actionNeeded: null,
          viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z",
        }),
        stubTrade({ id: "done", status: "completed" }),
        stubTrade({ id: "cancelled", status: "cancelled" }),
      ],
    })[0]!;

    expect(card.tradedCount).toBe(2);
  });

  it("counts live trades in the viewer's other groups separately", () => {
    const card = buildCards({
      groupTrades: [stubTrade({ id: "here", actionNeeded: "cancel" })],
      allTrades: [
        stubTrade({ id: "here", actionNeeded: "cancel" }),
        stubTrade({ id: "elsewhere", groupId: "group-2", status: "reserved" }),
        stubTrade({ id: "elsewhere-done", groupId: "group-2", status: "completed" }),
        stubTrade({
          id: "elsewhere-settled-by-me",
          groupId: "group-2",
          status: "reserved",
          actionNeeded: null,
          viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z",
        }),
      ],
    })[0]!;

    expect(card.elsewhereCount).toBe(1);
    expect(ids(card.open)).toEqual(["here"]);
  });

  it("counts distinct suggestions and drops the ones a live trade already covers", () => {
    const card = buildCards({
      incoming: [
        stubMatch({ printingId: "printing-1" }),
        stubMatch({ printingId: "printing-1" }),
        stubMatch({ printingId: "printing-2", buyEntryId: "entry-2" }),
      ],
      outgoing: [stubMatch({ printingId: "printing-3", buyEntryId: "entry-3" })],
      allTrades: [stubTrade({ printingId: "printing-2", status: "pending" })],
    })[0]!;

    expect(card.suggestions).toBe(2);
  });

  it("counts only what the viewer's other groups add on top of this one", () => {
    const card = buildCards({
      incoming: [stubMatch({ printingId: "printing-1" })],
      elsewhereIncoming: [
        stubMatch({ printingId: "printing-1" }),
        stubMatch({ printingId: "printing-9", buyEntryId: "entry-9" }),
      ],
    })[0]!;

    expect(card.suggestions).toBe(1);
    expect(card.suggestionsElsewhere).toBe(1);
  });

  it("drops an elsewhere suggestion a live trade already covers", () => {
    const card = buildCards({
      elsewhereIncoming: [stubMatch({ printingId: "printing-2", buyEntryId: "entry-2" })],
      allTrades: [stubTrade({ printingId: "printing-2", status: "pending" })],
    })[0]!;

    expect(card.suggestionsElsewhere).toBe(0);
  });

  it("keeps a member with suggestions only in another group off the quiet pile", () => {
    const card = buildCards({
      elsewhereIncoming: [stubMatch({ printingId: "printing-1" })],
    })[0]!;

    expect(isQuietTradeHubCard(card)).toBe(false);
  });

  it("counts only the wishlists and tradelists a member shares", () => {
    const card = buildCards({
      shares: [
        { userId: "user-2", listIntent: "wish" },
        { userId: "user-2", listIntent: "trade" },
        { userId: "user-2", listIntent: "organize" },
        { userId: VIEWER, listIntent: "trade" },
      ],
    })[0]!;

    expect(card.listCount).toBe(2);
  });

  it("orders the cards by how much they want doing, then by name", () => {
    const members = [
      { userId: VIEWER, userName: "You" },
      { userId: "quiet", userName: "Ashe" },
      { userId: "lists", userName: "Braum" },
      { userId: "suggested", userName: "Caitlyn" },
      { userId: "open", userName: "Darius" },
      { userId: "waiting", userName: "Ekko" },
    ];
    const withPerson = (userId: string, trade: Partial<CardTradeResponse>): CardTradeResponse =>
      stubTrade({
        ...trade,
        counterparty: { ...stubTrade().counterparty, userId, name: userId },
      });

    const cards = buildCards({
      members,
      groupTrades: [
        withPerson("waiting", { id: "needs", actionNeeded: "settle", status: "reserved" }),
        withPerson("open", { id: "open", actionNeeded: "cancel" }),
      ],
      incoming: [stubMatch({ counterpartyUserId: "suggested" })],
      shares: [{ userId: "lists", listIntent: "wish" }],
    });

    expect(cardIds(cards)).toEqual(["waiting", "open", "suggested", "lists", "quiet"]);
  });

  it("sorts a nameless member last among equals", () => {
    const cards = buildCards({
      members: [
        { userId: VIEWER, userName: "You" },
        { userId: "nameless", userName: null },
        { userId: "named", userName: "Zed" },
      ],
    });
    expect(cardIds(cards)).toEqual(["named", "nameless"]);
  });

  it("calls a card quiet only when nothing at all has happened with that member", () => {
    const quiet = buildCards()[0]!;
    expect(isQuietTradeHubCard(quiet)).toBe(true);

    const withHistory = buildCards({ groupTrades: [stubTrade({ status: "completed" })] })[0]!;
    expect(isQuietTradeHubCard(withHistory)).toBe(false);

    const elsewhere = buildCards({
      allTrades: [stubTrade({ groupId: "group-2", status: "pending" })],
    })[0]!;
    expect(isQuietTradeHubCard(elsewhere)).toBe(false);
  });
});

describe("suggestionsLine", () => {
  function withCounts(suggestions: number, suggestionsElsewhere: number) {
    return { ...buildCards()[0]!, suggestions, suggestionsElsewhere };
  }

  it("says nothing when the matcher found nothing anywhere", () => {
    expect(suggestionsLine(withCounts(0, 0))).toBeNull();
  });

  it("names this group's suggestions alone when there are no others", () => {
    expect(suggestionsLine(withCounts(1, 0))).toBe("1 possible trade");
    expect(suggestionsLine(withCounts(3, 0))).toBe("3 possible trades");
  });

  it("adds what the other groups hold on top", () => {
    expect(suggestionsLine(withCounts(3, 2))).toBe("3 possible trades · 2 more in other groups");
    expect(suggestionsLine(withCounts(3, 1))).toBe("3 possible trades · 1 more in another group");
  });

  it("stands on its own when every suggestion is in another group", () => {
    expect(suggestionsLine(withCounts(0, 1))).toBe("1 possible trade in another group");
    expect(suggestionsLine(withCounts(0, 4))).toBe("4 possible trades in other groups");
  });
});

describe("buildTradeShelf", () => {
  const empty = { needsYou: [], incoming: [], outgoing: [] };

  function details(shelf: ReturnType<typeof buildTradeShelf>): string[] {
    return shelf.rows.map((row) => `${row.key}: ${row.detail}`);
  }

  it("draws no row for a stage with nothing in it", () => {
    expect(
      details(
        buildTradeShelf({
          ...empty,
          needsYou: [stubTrade({ actionNeeded: "settle", role: "giver" })],
        }),
      ),
    ).toEqual(["hand-over: 1 card for Robin"]);
  });

  it("shrinks to a headline alone when the group is quiet", () => {
    expect(buildTradeShelf(empty)).toEqual({
      rows: [],
      waitingPeople: 0,
      headline: "No matches in this group yet",
    });
  });

  it("keeps the opportunity rows when nothing waits on the viewer", () => {
    const shelf = buildTradeShelf({ ...empty, incoming: [stubMatch()] });
    expect(shelf.headline).toBe("Nothing waiting on you");
    expect(details(shelf)).toEqual(["could-get: 1 card from 1 member"]);
  });

  it("splits the three obligation stages so no trade is counted twice", () => {
    const shelf = buildTradeShelf({
      ...empty,
      needsYou: [
        stubTrade({ id: "a", actionNeeded: "accept-or-decline", printingId: "printing-1" }),
        stubTrade({
          id: "b",
          actionNeeded: "settle",
          role: "giver",
          printingId: "printing-2",
        }),
        stubTrade({
          id: "c",
          actionNeeded: "settle",
          role: "receiver",
          printingId: "printing-3",
        }),
      ],
    });
    expect(details(shelf)).toEqual([
      "answer: 1 request from Robin",
      "hand-over: 1 card for Robin",
      "confirm: 1 card from Robin",
    ]);
    expect(shelf.rows.flatMap((row) => row.printingIds)).toEqual([
      "printing-1",
      "printing-2",
      "printing-3",
    ]);
  });

  it("names one person, joins two, and counts past that", () => {
    const withNames = (names: string[]) =>
      buildTradeShelf({
        ...empty,
        needsYou: names.map((name, index) =>
          stubTrade({
            id: `t-${index}`,
            actionNeeded: "settle",
            role: "giver",
            counterparty: {
              userId: `user-${index}`,
              name,
              image: null,
              gravatarHash: "hash",
              contactMethods: [],
            },
          }),
        ),
      });
    expect(details(withNames(["Robin"]))).toEqual(["hand-over: 1 card for Robin"]);
    expect(details(withNames(["Robin", "Alex"]))).toEqual([
      "hand-over: 2 cards for Alex and Robin",
    ]);
    expect(details(withNames(["Robin", "Alex", "Mo"]))).toEqual([
      "hand-over: 3 cards for 3 members",
    ]);
  });

  it("counts people, not trades, in the headline", () => {
    const shelf = buildTradeShelf({
      ...empty,
      needsYou: [
        stubTrade({ id: "a", actionNeeded: "settle", role: "giver" }),
        stubTrade({ id: "b", actionNeeded: "settle", role: "giver" }),
      ],
    });
    expect(shelf).toMatchObject({ waitingPeople: 1, headline: "1 person is waiting on you" });
  });

  it("appends the expiry tail to the requests row only", () => {
    const soon = new Date("2026-08-02T10:00:00.000Z").toISOString();
    const shelf = buildTradeShelf({
      ...empty,
      needsYou: [
        stubTrade({ id: "a", actionNeeded: "accept-or-decline", expiresAt: soon }),
        stubTrade({ id: "b", actionNeeded: "settle", role: "giver" }),
      ],
      now: new Date("2026-08-01T10:00:00.000Z"),
    });
    expect(details(shelf)).toEqual([
      "answer: 1 request from Robin, 1 expires soon",
      "hand-over: 1 card for Robin",
    ]);
  });

  it("counts distinct suggestions but shows distinct printings", () => {
    const shelf = buildTradeShelf({
      ...empty,
      incoming: [
        stubMatch({ counterpartyUserId: "user-2" }),
        stubMatch({ counterpartyUserId: "user-3" }),
      ],
    });
    expect(details(shelf)).toEqual(["could-get: 2 cards from 2 members"]);
    expect(shelf.rows[0]?.printingIds).toEqual(["printing-1"]);
  });

  it("keeps the two suggestion directions apart", () => {
    const shelf = buildTradeShelf({
      ...empty,
      incoming: [stubMatch({ printingId: "printing-1" })],
      outgoing: [stubMatch({ printingId: "printing-2", buyEntryId: "entry-2" })],
    });
    expect(details(shelf)).toEqual([
      "could-get: 1 card from 1 member",
      "would-want: 1 card, wanted by 1 member",
    ]);
  });

  it("falls back to a generic name for a counterparty with none", () => {
    expect(
      details(
        buildTradeShelf({
          ...empty,
          needsYou: [
            stubTrade({
              actionNeeded: "settle",
              role: "receiver",
              counterparty: {
                userId: "user-2",
                name: null,
                image: null,
                gravatarHash: "hash",
                contactMethods: [],
              },
            }),
          ],
        }),
      ),
    ).toEqual(["confirm: 1 card from a member"]);
  });
});
