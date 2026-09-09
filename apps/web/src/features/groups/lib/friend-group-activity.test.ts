import type { FriendGroupActivityEvent } from "@openrift/shared/types/api/friend-group";
import { describe, expect, it } from "vitest";

import { buildActivityDays, distinctPrintingIds, tradeVolumeLabel } from "./friend-group-activity";

type TradeCompletedEvent = Extract<FriendGroupActivityEvent, { kind: "trade-completed" }>;

let tradeSeq = 0;

const atLocal = (day: number, hour: number): string =>
  new Date(2026, 6, day, hour, 0, 0).toISOString();

function trade(at: string, overrides: Partial<TradeCompletedEvent> = {}): TradeCompletedEvent {
  tradeSeq += 1;
  return {
    kind: "trade-completed",
    at,
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
    userId: `user-${at}`,
    userName: "Garruk",
    userImage: null,
    gravatarHash: "hash",
  };
}

describe("buildActivityDays", () => {
  it("returns an empty list for no events", () => {
    expect(buildActivityDays([], 20)).toEqual([]);
  });

  it("gathers same-day events into one group anchored at the newest timestamp", () => {
    const newer = memberJoined(atLocal(15, 18));
    const older = memberJoined(atLocal(15, 9));
    const days = buildActivityDays([newer, older], 20);
    expect(days).toHaveLength(1);
    expect(days[0]!.at).toBe(newer.at);
    expect(days[0]!.rows.map((row) => row.at)).toEqual([newer.at, older.at]);
  });

  it("splits events on different local days into separate groups, newest-first", () => {
    const today = memberJoined(atLocal(15, 12));
    const yesterdayLate = memberJoined(atLocal(14, 23));
    const yesterdayEarly = memberJoined(atLocal(14, 1));
    const lastWeek = memberJoined(atLocal(8, 12));
    const days = buildActivityDays([today, yesterdayLate, yesterdayEarly, lastWeek], 20);
    expect(days.map((day) => day.rows.map((row) => row.at))).toEqual([
      [today.at],
      [yesterdayLate.at, yesterdayEarly.at],
      [lastWeek.at],
    ]);
    expect(days.map((day) => day.at)).toEqual([today.at, yesterdayLate.at, lastWeek.at]);
  });

  it("keys groups uniquely across month boundaries", () => {
    const july = memberJoined(new Date(2026, 6, 1, 12).toISOString());
    const june = memberJoined(new Date(2026, 5, 1, 12).toISOString());
    const days = buildActivityDays([july, june], 20);
    expect(days).toHaveLength(2);
    expect(days[0]!.key).not.toBe(days[1]!.key);
  });

  it("collapses a same-day run of same-pair trades into one batch row", () => {
    const first = trade(atLocal(15, 12), { quantity: 2 });
    const second = trade(atLocal(15, 11), { quantity: 3 });
    const days = buildActivityDays([first, second], 20);
    expect(days).toHaveLength(1);
    const batch = days[0]!.rows[0]!;
    expect(batch.kind).toBe("trade-batch");
    if (batch.kind !== "trade-batch") {
      return;
    }
    expect(batch.totalQuantity).toBe(5);
  });

  it("keeps a same-pair run split across days on its own day", () => {
    const today = trade(atLocal(15, 12));
    const yesterday = trade(atLocal(14, 12));
    const days = buildActivityDays([today, yesterday], 20);
    expect(days.map((day) => day.rows.map((row) => row.kind))).toEqual([["event"], ["event"]]);
  });

  it("spends the budget on rows, so one big batch leaves room for older days", () => {
    const batched = Array.from({ length: 25 }, (_unused, index) =>
      trade(new Date(2026, 6, 15, 12, -index).toISOString()),
    );
    const joined = memberJoined(atLocal(14, 12));
    const days = buildActivityDays([...batched, joined], 2);
    expect(days.map((day) => day.rows.map((row) => row.kind))).toEqual([
      ["trade-batch"],
      ["event"],
    ]);
  });

  it("drops days once the budget is spent", () => {
    const days = buildActivityDays(
      [memberJoined(atLocal(15, 12)), memberJoined(atLocal(14, 12)), memberJoined(atLocal(13, 12))],
      2,
    );
    expect(days.map((day) => day.at)).toEqual([atLocal(15, 12), atLocal(14, 12)]);
  });

  it("truncates a day's rows to the remaining budget", () => {
    const days = buildActivityDays(
      [memberJoined(atLocal(15, 12)), memberJoined(atLocal(14, 18)), memberJoined(atLocal(14, 9))],
      2,
    );
    expect(days.map((day) => day.rows.length)).toEqual([1, 1]);
    expect(days[1]!.rows[0]!.at).toBe(atLocal(14, 18));
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
