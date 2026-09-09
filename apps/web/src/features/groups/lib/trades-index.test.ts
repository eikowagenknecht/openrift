import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
import { describe, expect, it } from "vitest";

import type { TradesIndexMatch, TradesIndexMatchGroup } from "./trades-index";
import { buildTradesIndex } from "./trades-index";

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "summoner-skirmish",
    groupName: "Summoner Skirmish",
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

function withPerson(userId: string | null, name: string | null): Partial<CardTradeResponse> {
  return { counterparty: { userId, name, image: null, gravatarHash: "h", contactMethods: [] } };
}

function stubMatch(overrides: Partial<TradesIndexMatch> = {}): TradesIndexMatch {
  return {
    counterpartyUserId: "user-2",
    counterpartyName: "Robin",
    counterpartyImage: null,
    counterpartyGravatarHash: "hash",
    counterpartyListId: "list-1",
    buyEntryId: "buy-1",
    buyEntryKind: "printing",
    cardId: "card-1",
    printingId: "printing-1",
    ...overrides,
  };
}

function stubMatchGroup(overrides: Partial<TradesIndexMatchGroup> = {}): TradesIndexMatchGroup {
  return {
    groupId: "group-1",
    groupName: "Summoner Skirmish",
    incoming: [],
    outgoing: [],
    ...overrides,
  };
}

describe("buildTradesIndex", () => {
  it("returns empty sections for no trades", () => {
    expect(buildTradesIndex([])).toEqual({
      yourMove: [],
      waiting: [],
      couldTrade: [],
      past: [],
      groupCount: 0,
    });
  });

  it("files a person under your move when any trade needs the viewer", () => {
    const index = buildTradesIndex([
      stubTrade({ id: "a", actionNeeded: "accept-or-decline" }),
      stubTrade({ id: "b", status: "completed", completedAt: "2026-08-02T10:00:00.000Z" }),
    ]);
    expect(index.yourMove.map((person) => person.userId)).toEqual(["user-2"]);
    expect(index.waiting).toEqual([]);
    expect(index.couldTrade).toEqual([]);
    expect(index.past).toEqual([]);
    expect(index.yourMove[0]?.needsYou.map((trade) => trade.id)).toEqual(["a"]);
    expect(index.yourMove[0]?.doneCount).toBe(1);
  });

  it("files a person under waiting when only they have a move left", () => {
    const index = buildTradesIndex([stubTrade({ actionNeeded: "cancel" })]);
    expect(index.waiting.map((person) => person.userId)).toEqual(["user-2"]);
    expect(index.waiting[0]?.waiting).toHaveLength(1);
  });

  it("files a person with only finished trades under past, newest first", () => {
    const index = buildTradesIndex([
      stubTrade({
        id: "old",
        status: "completed",
        updatedAt: "2026-07-01T10:00:00.000Z",
        ...withPerson("user-3", "Ash"),
      }),
      stubTrade({ id: "new", status: "completed", updatedAt: "2026-08-05T10:00:00.000Z" }),
      stubTrade({ id: "closed", status: "declined", updatedAt: "2026-08-06T10:00:00.000Z" }),
    ]);
    expect(index.past.map((person) => person.userId)).toEqual(["user-2", "user-3"]);
    expect(index.past[0]?.doneCount).toBe(1);
    expect(index.past[0]?.lastActivityAt).toBe("2026-08-06T10:00:00.000Z");
  });

  it("orders your move by the most urgent trade, then by name", () => {
    const index = buildTradesIndex([
      stubTrade({
        id: "settle-only",
        status: "reserved",
        actionNeeded: "settle",
        ...withPerson("user-3", "Ash"),
      }),
      stubTrade({
        id: "later",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-09T10:00:00.000Z",
        ...withPerson("user-4", "Zed"),
      }),
      stubTrade({
        id: "soon",
        actionNeeded: "accept-or-decline",
        expiresAt: "2026-08-03T10:00:00.000Z",
      }),
    ]);
    expect(index.yourMove.map((person) => person.userId)).toEqual(["user-2", "user-4", "user-3"]);
  });

  it("sorts waiting people by name with the nameless last", () => {
    const index = buildTradesIndex([
      stubTrade({ id: "a", actionNeeded: "cancel", ...withPerson("user-5", null) }),
      stubTrade({ id: "b", actionNeeded: "cancel", ...withPerson("user-4", "Zed") }),
      stubTrade({ id: "c", actionNeeded: "cancel", ...withPerson("user-3", "Ash") }),
    ]);
    expect(index.waiting.map((person) => person.userId)).toEqual(["user-3", "user-4", "user-5"]);
  });

  it("collects the distinct group names per person and counts groups overall", () => {
    const index = buildTradesIndex([
      stubTrade({ id: "a", actionNeeded: "cancel" }),
      stubTrade({
        id: "b",
        actionNeeded: "cancel",
        groupId: "group-2",
        groupSlug: "arcane-league",
        groupName: "Arcane League",
      }),
      stubTrade({ id: "c", actionNeeded: "cancel" }),
    ]);
    expect(index.waiting[0]?.groupNames).toEqual(["Arcane League", "Summoner Skirmish"]);
    expect(index.groupCount).toBe(2);
  });

  it("files someone the viewer only has matches with under could trade", () => {
    const index = buildTradesIndex(
      [],
      [stubMatchGroup({ incoming: [stubMatch()], outgoing: [stubMatch({ printingId: "p-2" })] })],
    );
    expect(index.couldTrade.map((person) => person.userId)).toEqual(["user-2"]);
    expect(index.couldTrade[0]?.suggestions).toBe(2);
    expect(index.couldTrade[0]?.suggestionPrintingIds).toEqual(["printing-1", "p-2"]);
    expect(index.couldTrade[0]?.groupNames).toEqual(["Summoner Skirmish"]);
    expect(index.couldTrade[0]?.lastActivityAt).toBeNull();
    expect(index.groupCount).toBe(1);
  });

  it("counts a card reachable through two groups once", () => {
    const index = buildTradesIndex(
      [],
      [
        stubMatchGroup({ incoming: [stubMatch()] }),
        stubMatchGroup({
          groupId: "group-2",
          groupName: "Arcane League",
          incoming: [stubMatch()],
        }),
      ],
    );
    expect(index.couldTrade[0]?.suggestions).toBe(1);
    expect(index.couldTrade[0]?.groupNames).toEqual(["Arcane League", "Summoner Skirmish"]);
    expect(index.groupCount).toBe(2);
  });

  it("drops matches a live trade already covers", () => {
    const index = buildTradesIndex(
      [stubTrade({ status: "pending", printingId: "printing-1" })],
      [stubMatchGroup({ incoming: [stubMatch()] })],
    );
    expect(index.couldTrade).toEqual([]);
    expect(index.waiting[0]?.suggestions).toBe(0);
  });

  it("moves a past counterparty to could trade when a match remains", () => {
    const index = buildTradesIndex(
      [stubTrade({ status: "completed" })],
      [stubMatchGroup({ incoming: [stubMatch({ printingId: "printing-2" })] })],
    );
    expect(index.past).toEqual([]);
    expect(index.couldTrade.map((person) => person.userId)).toEqual(["user-2"]);
    expect(index.couldTrade[0]?.doneCount).toBe(1);
  });

  it("orders could trade by suggestion count, then by name", () => {
    const index = buildTradesIndex(
      [],
      [
        stubMatchGroup({
          incoming: [
            stubMatch({ counterpartyUserId: "user-3", counterpartyName: "Ash" }),
            stubMatch({ counterpartyUserId: "user-4", counterpartyName: "Zed" }),
            stubMatch({ printingId: "p-2" }),
            stubMatch(),
          ],
        }),
      ],
    );
    expect(index.couldTrade.map((person) => person.userId)).toEqual(["user-2", "user-3", "user-4"]);
  });

  it("leaves out trades whose counterparty account is gone", () => {
    const index = buildTradesIndex([
      stubTrade({ status: "completed", ...withPerson(null, "Gone") }),
    ]);
    expect(index.past).toEqual([]);
    expect(index.groupCount).toBe(1);
  });
});
