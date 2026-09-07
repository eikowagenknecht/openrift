import type { FriendGroupActivityEvent } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { AggregatedActivityRow } from "./friend-group-activity";
import {
  aggregateActivityEvents,
  distinctPrintingIds,
  groupActivityRowsByDay,
  tradeVolumeLabel,
} from "./friend-group-activity";

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
    giverName: "Mira",
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
    const batch = rows[0]!;
    expect(batch.kind).toBe("trade-batch");
    if (batch.kind !== "trade-batch") {
      return;
    }
    expect(batch.at).toBe(first.at);
    expect(batch.totalQuantity).toBe(6);
    expect(batch.giverName).toBe("Mira");
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
      receiverName: "Mira",
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
    expect(rows[0]!.kind).toBe("event");
    expect(rows[1]!.kind).toBe("trade-batch");
  });
});

describe("groupActivityRowsByDay", () => {
  const atLocal = (day: number, hour: number): string =>
    new Date(2026, 6, day, hour, 0, 0).toISOString();

  const eventRow = (at: string): AggregatedActivityRow => ({
    kind: "event",
    at,
    event: memberJoined(at),
  });

  it("returns an empty list for no rows", () => {
    expect(groupActivityRowsByDay([])).toEqual([]);
  });

  it("gathers same-day rows into one group anchored at the newest timestamp", () => {
    const newer = eventRow(atLocal(15, 18));
    const older = eventRow(atLocal(15, 9));
    const groups = groupActivityRowsByDay([newer, older]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.at).toBe(newer.at);
    expect(groups[0]!.rows).toEqual([newer, older]);
  });

  it("splits rows on different local days into separate groups, newest-first", () => {
    const today = eventRow(atLocal(15, 12));
    const yesterdayLate = eventRow(atLocal(14, 23));
    const yesterdayEarly = eventRow(atLocal(14, 1));
    const lastWeek = eventRow(atLocal(8, 12));
    const groups = groupActivityRowsByDay([today, yesterdayLate, yesterdayEarly, lastWeek]);
    expect(groups.map((group) => group.rows)).toEqual([
      [today],
      [yesterdayLate, yesterdayEarly],
      [lastWeek],
    ]);
    expect(groups.map((group) => group.at)).toEqual([today.at, yesterdayLate.at, lastWeek.at]);
  });

  it("keys groups uniquely across month boundaries", () => {
    const july = eventRow(new Date(2026, 6, 1, 12).toISOString());
    const june = eventRow(new Date(2026, 5, 1, 12).toISOString());
    const groups = groupActivityRowsByDay([july, june]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).not.toBe(groups[1]!.key);
  });

  it("carries trade-batch rows like plain event rows", () => {
    const batchAt = atLocal(15, 12);
    const [batch] = aggregateActivityEvents([
      trade({ at: batchAt }),
      trade({ at: atLocal(15, 11) }),
    ]);
    const joined = eventRow(atLocal(14, 12));
    const groups = groupActivityRowsByDay([batch!, joined]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toEqual([batch]);
    expect(groups[0]!.at).toBe(batchAt);
  });
});

describe("distinctPrintingIds", () => {
  it("keeps only the first occurrence of a repeated printing, in event order", () => {
    const events = [
      { printingId: "p-1" },
      { printingId: "p-2" },
      { printingId: "p-1" },
      { printingId: "p-3" },
      { printingId: "p-2" },
    ];
    expect(distinctPrintingIds(events)).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("returns an empty list for no card-bearing events", () => {
    expect(distinctPrintingIds([])).toEqual([]);
  });
});

describe("tradeVolumeLabel", () => {
  it("leads with the volume inside the window", () => {
    expect(tradeVolumeLabel(12, 40)).toBe("12 cards traded in the last 30 days");
    expect(tradeVolumeLabel(1, 1)).toBe("1 card traded in the last 30 days");
  });

  it("separates a group gone quiet from one that never got going", () => {
    expect(tradeVolumeLabel(0, 40)).toBe("No trades in the last 30 days");
    expect(tradeVolumeLabel(0, 0)).toBe("No trades here yet");
  });
});
