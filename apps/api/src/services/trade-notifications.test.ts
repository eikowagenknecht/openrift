import { describe, expect, it } from "vitest";

import { isRequestGroupDue, isTradeRequestFlushNoop } from "./trade-notifications.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("isRequestGroupDue", () => {
  it("is always due on the instant cadence, even for a fresh request", () => {
    expect(isRequestGroupDue("instant", [minutesAgo(0)], NOW)).toBe(true);
  });

  it("is not due while a timed burst is still inside its window", () => {
    // Last request 2 min ago, window 5 min → the burst is still settling.
    expect(isRequestGroupDue("5min", [minutesAgo(4), minutesAgo(2)], NOW)).toBe(false);
  });

  it("is due once a timed burst has been quiet for the full window", () => {
    expect(isRequestGroupDue("5min", [minutesAgo(6)], NOW)).toBe(true);
  });

  it("fires at the 2x-window cap even when requests keep arriving", () => {
    // Newest request is only 1 min old (not quiet), but the oldest is 11 min old,
    // past the 2 x 5 = 10 min cap → due so the burst can't defer forever.
    expect(isRequestGroupDue("5min", [minutesAgo(11), minutesAgo(1)], NOW)).toBe(true);
  });

  it("is not due for an empty timed group", () => {
    expect(isRequestGroupDue("15min", [], NOW)).toBe(false);
  });
});

describe("isTradeRequestFlushNoop", () => {
  it("is a no-op when nothing was due, sent, or folded in", () => {
    expect(isTradeRequestFlushNoop({ pairs: 0, emailsSent: 0, requests: 0 })).toBe(true);
  });

  it("did work when an email was sent", () => {
    expect(isTradeRequestFlushNoop({ pairs: 1, emailsSent: 1, requests: 3 })).toBe(false);
  });

  it("did work when a pair was due even if the send was gated to zero emails", () => {
    expect(isTradeRequestFlushNoop({ pairs: 2, emailsSent: 0, requests: 5 })).toBe(false);
  });
});
