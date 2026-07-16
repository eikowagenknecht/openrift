import type { FriendGroupActivityEvent } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { aggregateActivityEvents } from "./friend-group-activity";

type TradeCompletedEvent = Extract<FriendGroupActivityEvent, { kind: "trade-completed" }>;

let tradeSeq = 0;

function trade(overrides: Partial<TradeCompletedEvent> = {}): TradeCompletedEvent {
  tradeSeq += 1;
  return {
    kind: "trade-completed",
    at: "2026-07-15T12:00:00.000Z",
    tradeId: `trade-${tradeSeq}`,
    printingId: `printing-${tradeSeq}`,
    cardId: `card-${tradeSeq}`,
    quantity: 1,
    giverUserId: "giver-1",
    giverName: "Thogrim",
    receiverUserId: "receiver-1",
    receiverName: "EPA",
    ...overrides,
  };
}

function memberJoined(at: string): FriendGroupActivityEvent {
  return {
    kind: "member-joined",
    at,
    userId: "user-9",
    userName: "Garruk",
    userImage: null,
    gravatarHash: "hash",
  };
}

describe("aggregateActivityEvents", () => {
  it("returns an empty list for no events", () => {
    expect(aggregateActivityEvents([])).toEqual([]);
  });

  it("keeps a lone trade as a plain event row", () => {
    const event = trade();
    const rows = aggregateActivityEvents([event]);
    expect(rows).toEqual([{ kind: "event", at: event.at, event }]);
  });

  it("keeps non-trade events as plain event rows", () => {
    const event = memberJoined("2026-07-15T10:00:00.000Z");
    const rows = aggregateActivityEvents([event]);
    expect(rows).toEqual([{ kind: "event", at: event.at, event }]);
  });

  it("collapses consecutive same-pair trades into one batch summing quantities", () => {
    const first = trade({ at: "2026-07-15T12:00:00.000Z", quantity: 2 });
    const second = trade({ at: "2026-07-15T11:59:00.000Z", quantity: 1 });
    const third = trade({ at: "2026-07-15T11:58:00.000Z", quantity: 3 });
    const rows = aggregateActivityEvents([first, second, third]);
    expect(rows).toHaveLength(1);
    const batch = rows[0];
    expect(batch.kind).toBe("trade-batch");
    if (batch.kind !== "trade-batch") {
      return;
    }
    expect(batch.at).toBe(first.at);
    expect(batch.totalQuantity).toBe(6);
    expect(batch.giverName).toBe("Thogrim");
    expect(batch.receiverName).toBe("EPA");
    expect(batch.events).toEqual([first, second, third]);
  });

  it("does not merge trades between different pairs", () => {
    const pairA = trade();
    const pairB = trade({ giverUserId: "giver-2", giverName: "Chris" });
    const rows = aggregateActivityEvents([pairA, pairB]);
    expect(rows).toEqual([
      { kind: "event", at: pairA.at, event: pairA },
      { kind: "event", at: pairB.at, event: pairB },
    ]);
  });

  it("does not merge same-pair trades separated by another event", () => {
    const before = trade();
    const interruption = memberJoined("2026-07-15T11:30:00.000Z");
    const after = trade();
    const rows = aggregateActivityEvents([before, interruption, after]);
    expect(rows.map((row) => row.kind)).toEqual(["event", "event", "event"]);
  });

  it("treats reversed direction as a different pair", () => {
    const give = trade();
    const receive = trade({
      giverUserId: "receiver-1",
      giverName: "EPA",
      receiverUserId: "giver-1",
      receiverName: "Thogrim",
    });
    const rows = aggregateActivityEvents([give, receive]);
    expect(rows.map((row) => row.kind)).toEqual(["event", "event"]);
  });

  it("closes a run at the end of the list", () => {
    const joined = memberJoined("2026-07-15T13:00:00.000Z");
    const first = trade({ quantity: 2 });
    const second = trade({ quantity: 2 });
    const rows = aggregateActivityEvents([joined, first, second]);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("event");
    expect(rows[1].kind).toBe("trade-batch");
  });
});
