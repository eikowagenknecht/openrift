import type { CardTradeResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { splitTradeLedger, stepSequence } from "./trade-sheet";

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

/** @returns A trade with a different counterparty, for scoping assertions. */
function someoneElses(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return stubTrade({
    counterparty: {
      userId: "user-9",
      name: "Sam",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    ...overrides,
  });
}

/** @returns The trade ids of a ledger list, for order assertions. */
function ids(trades: CardTradeResponse[]): string[] {
  return trades.map((trade) => trade.id);
}

describe("splitTradeLedger", () => {
  it("splits by requests to answer, swaps to settle, what waits on them, and what is finished", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({ id: "answer", status: "pending", actionNeeded: "accept-or-decline" }),
        stubTrade({ id: "settle", status: "reserved", actionNeeded: "settle" }),
        stubTrade({ id: "sent", status: "pending", actionNeeded: "cancel" }),
        stubTrade({ id: "reserved-waiting", status: "reserved" }),
        stubTrade({ id: "done", status: "completed" }),
      ],
      "user-2",
    );

    expect(ids(ledger.yourMove)).toEqual(["answer"]);
    expect(ids(ledger.readyToSwap)).toEqual(["settle"]);
    expect(ids(ledger.waiting)).toEqual(["reserved-waiting", "sent"]);
    expect(ids(ledger.history)).toEqual(["done"]);
  });

  it("returns four empty lists for no trades", () => {
    expect(splitTradeLedger([], "user-2")).toEqual({
      yourMove: [],
      readyToSwap: [],
      waiting: [],
      history: [],
    });
  });

  it("drops trades with other people from every list", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({ id: "theirs", status: "pending", actionNeeded: "accept-or-decline" }),
        someoneElses({ id: "someone-else", status: "pending" }),
        someoneElses({ id: "someone-else-settle", status: "reserved", actionNeeded: "settle" }),
        someoneElses({ id: "someone-else-done", status: "completed" }),
      ],
      "user-2",
    );

    expect(ids(ledger.yourMove)).toEqual(["theirs"]);
    expect(ledger.readyToSwap).toEqual([]);
    expect(ledger.waiting).toEqual([]);
    expect(ledger.history).toEqual([]);
  });

  it("orders your-move requests soonest expiry first", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({
          id: "answer-later",
          actionNeeded: "accept-or-decline",
          expiresAt: "2026-06-04T00:00:00Z",
        }),
        stubTrade({
          id: "answer-soon",
          actionNeeded: "accept-or-decline",
          expiresAt: "2026-06-02T00:00:00Z",
        }),
      ],
      "user-2",
    );

    expect(ids(ledger.yourMove)).toEqual(["answer-soon", "answer-later"]);
  });

  it("gathers both directions of a swap into ready-to-swap, most recently touched first", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({
          id: "hand-over",
          role: "giver",
          status: "reserved",
          actionNeeded: "settle",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }),
        stubTrade({
          id: "receive",
          role: "receiver",
          status: "reserved",
          actionNeeded: "settle",
          updatedAt: "2026-06-05T00:00:00.000Z",
        }),
      ],
      "user-2",
    );

    expect(ids(ledger.readyToSwap)).toEqual(["receive", "hand-over"]);
    expect(ledger.yourMove).toEqual([]);
  });

  it("orders the waiting section agreed swaps first, then sent requests, newest first", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({
          id: "sent-old",
          status: "pending",
          actionNeeded: "cancel",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }),
        stubTrade({
          id: "sent-new",
          status: "pending",
          actionNeeded: "cancel",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        stubTrade({ id: "reserved", status: "reserved", updatedAt: "2026-05-01T00:00:00.000Z" }),
      ],
      "user-2",
    );

    expect(ids(ledger.waiting)).toEqual(["reserved", "sent-new", "sent-old"]);
  });

  it("keeps every terminal status in history, newest first", () => {
    const ledger = splitTradeLedger(
      [
        stubTrade({ id: "declined", status: "declined", updatedAt: "2026-05-01T00:00:00.000Z" }),
        stubTrade({ id: "expired", status: "expired", updatedAt: "2026-05-03T00:00:00.000Z" }),
        stubTrade({ id: "cancelled", status: "cancelled", updatedAt: "2026-05-02T00:00:00.000Z" }),
        stubTrade({ id: "completed", status: "completed", updatedAt: "2026-05-04T00:00:00.000Z" }),
      ],
      "user-2",
    );

    expect(ids(ledger.history)).toEqual(["completed", "expired", "cancelled", "declined"]);
    expect(ledger.yourMove).toEqual([]);
    expect(ledger.readyToSwap).toEqual([]);
    expect(ledger.waiting).toEqual([]);
  });

  it("puts a legacy completed trade still awaiting a settle in ready-to-swap, not history", () => {
    // Action-based on purpose: the row is a pile in front of the viewer, and
    // filing it under history would make the sheet disagree with the group
    // surfaces' people-first counts.
    const ledger = splitTradeLedger(
      [stubTrade({ id: "legacy", status: "completed", actionNeeded: "settle" })],
      "user-2",
    );

    expect(ids(ledger.readyToSwap)).toEqual(["legacy"]);
    expect(ledger.history).toEqual([]);
  });

  it("folds a reserved swap the viewer has settled into history, not waiting", () => {
    // Their half is final, so there is nothing left for them to chase; only the
    // other party's confirmation is outstanding.
    const ledger = splitTradeLedger(
      [
        stubTrade({
          id: "settled-my-half",
          status: "reserved",
          viewerSyncAppliedAt: "2026-06-03T00:00:00.000Z",
          updatedAt: "2026-06-03T00:00:00.000Z",
        }),
        stubTrade({ id: "sent", status: "pending", actionNeeded: "cancel" }),
      ],
      "user-2",
    );

    expect(ids(ledger.history)).toEqual(["settled-my-half"]);
    expect(ids(ledger.waiting)).toEqual(["sent"]);
    expect(ledger.readyToSwap).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const trades = [
      stubTrade({ id: "pending", status: "pending" }),
      stubTrade({ id: "settle", status: "reserved", actionNeeded: "settle" }),
    ];

    splitTradeLedger(trades, "user-2");

    expect(ids(trades)).toEqual(["pending", "settle"]);
  });
});

describe("stepSequence", () => {
  it("lists each printing once, in the order the rows are shown", () => {
    expect(
      stepSequence([
        stubTrade({ id: "a", printingId: "printing-2" }),
        stubTrade({ id: "b", printingId: "printing-1" }),
        stubTrade({ id: "c", printingId: "printing-2" }),
      ]),
    ).toEqual(["printing-2", "printing-1"]);
  });

  it("has nothing to step through for a single distinct printing", () => {
    expect(stepSequence([stubTrade({ id: "a" }), stubTrade({ id: "b" })])).toBeUndefined();
    expect(stepSequence([])).toBeUndefined();
  });
});
