import { describe, expect, it } from "vitest";

import {
  dateLeafParts,
  dateLeafPartsUtc,
  formatCompactUtcStamp,
  formatDay,
  formatDayLocal,
  formatDayTime,
  formatDayTimeLocal,
  formatTimeLocal,
  formatMonth,
  formatRelativeDay,
  formatRelativeTime,
} from "./format-date.js";

const NOW = new Date("2026-06-08T12:00:00.000Z");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function ahead(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

describe("formatDay", () => {
  it("passes a date-only string through unchanged", () => {
    expect(formatDay("2026-08-15")).toBe("2026-08-15");
  });

  it("takes the UTC calendar day of an instant", () => {
    expect(formatDay("2026-08-15T22:30:00.000Z")).toBe("2026-08-15");
  });

  it("does not shift the day for an instant late in the UTC evening", () => {
    expect(formatDay("2026-08-15T23:59:59.999Z")).toBe("2026-08-15");
  });

  it("accepts a Date", () => {
    expect(formatDay(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatDay("not a date")).toBe("");
    expect(formatDay("")).toBe("");
  });
});

describe("formatMonth", () => {
  it("renders the UTC month", () => {
    expect(formatMonth("2026-08-15")).toBe("2026-08");
    expect(formatMonth("2026-01-01T00:00:00.000Z")).toBe("2026-01");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatMonth("nope")).toBe("");
  });
});

describe("formatDayTime", () => {
  it("renders a UTC instant to minute precision", () => {
    expect(formatDayTime("2099-12-31T23:59:30.000Z")).toBe("2099-12-31 23:59");
  });

  it("truncates rather than rounds the seconds", () => {
    expect(formatDayTime("2026-08-15T14:30:59.999Z")).toBe("2026-08-15 14:30");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatDayTime("nope")).toBe("");
  });
});

describe("formatDayLocal", () => {
  it("renders the day in the running timezone", () => {
    expect(formatDayLocal(new Date(2026, 7, 15, 23, 30))).toBe("2026-08-15");
  });

  it("zero-pads month and day", () => {
    expect(formatDayLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatDayLocal("nope")).toBe("");
  });
});

describe("formatTimeLocal", () => {
  it("renders 24-hour time in the running timezone", () => {
    expect(formatTimeLocal(new Date(2026, 7, 15, 14, 30))).toBe("14:30");
  });

  it("uses a 24-hour clock past noon rather than an am/pm form", () => {
    expect(formatTimeLocal(new Date(2026, 7, 15, 23, 5))).toBe("23:05");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatTimeLocal("nope")).toBe("");
  });
});

describe("formatDayTimeLocal", () => {
  it("renders an instant in the running timezone", () => {
    expect(formatDayTimeLocal(new Date(2026, 7, 15, 14, 30))).toBe("2026-08-15 14:30");
  });

  it("zero-pads every part", () => {
    expect(formatDayTimeLocal(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05 09:07");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatDayTimeLocal("nope")).toBe("");
  });
});

describe("formatCompactUtcStamp", () => {
  it("zero-pads a single-digit month, day, hour, and minute", () => {
    expect(formatCompactUtcStamp(new Date("2026-01-05T09:07:00.000Z"))).toBe("20260105-0907");
  });

  it("accepts a string input", () => {
    expect(formatCompactUtcStamp("2026-08-15T14:30:00.000Z")).toBe("20260815-1430");
  });

  it("takes the UTC calendar day even when it differs from the local one", () => {
    expect(formatCompactUtcStamp(new Date("2026-08-15T23:30:00.000Z"))).toBe("20260815-2330");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatCompactUtcStamp("nope")).toBe("");
  });
});

describe("dateLeafParts", () => {
  it("splits a date into an uppercase month, a bare day and the year", () => {
    expect(dateLeafParts(new Date(2026, 7, 15))).toEqual({
      month: "AUG",
      day: "15",
      year: "2026",
    });
  });

  it("does not pad the day", () => {
    expect(dateLeafParts(new Date(2026, 0, 5))).toEqual({ month: "JAN", day: "5", year: "2026" });
  });

  it("returns empty parts for unparseable input", () => {
    expect(dateLeafParts("nope")).toEqual({ month: "", day: "", year: "" });
  });
});

describe("dateLeafPartsUtc", () => {
  it("splits a date-only day without shifting it into the day before", () => {
    expect(dateLeafPartsUtc("2026-08-01")).toEqual({ month: "AUG", day: "1", year: "2026" });
  });

  it("takes the UTC day of a full instant, not the viewer's", () => {
    expect(dateLeafPartsUtc(new Date("2026-01-01T02:30:00.000Z"))).toEqual({
      month: "JAN",
      day: "1",
      year: "2026",
    });
  });

  it("takes the UTC year too, so a New Year instant does not report the year before", () => {
    expect(dateLeafPartsUtc(new Date("2027-01-01T00:30:00.000Z")).year).toBe("2027");
  });

  it("returns empty parts for unparseable input", () => {
    expect(dateLeafPartsUtc("nope")).toEqual({ month: "", day: "", year: "" });
  });
});

describe("formatRelativeTime", () => {
  it("renders sub-minute past as 'just now'", () => {
    expect(formatRelativeTime(ago(0), { now: NOW })).toBe("just now");
    expect(formatRelativeTime(ago(59 * SECOND), { now: NOW })).toBe("just now");
  });

  it("renders sub-minute future as 'in <1m'", () => {
    expect(formatRelativeTime(ahead(30 * SECOND), { now: NOW })).toBe("in <1m");
  });

  it("renders the past across every bucket", () => {
    expect(formatRelativeTime(ago(MINUTE), { now: NOW })).toBe("1m ago");
    expect(formatRelativeTime(ago(59 * MINUTE), { now: NOW })).toBe("59m ago");
    expect(formatRelativeTime(ago(HOUR), { now: NOW })).toBe("1h ago");
    expect(formatRelativeTime(ago(23 * HOUR), { now: NOW })).toBe("23h ago");
    expect(formatRelativeTime(ago(DAY), { now: NOW })).toBe("1d ago");
    expect(formatRelativeTime(ago(6 * DAY), { now: NOW })).toBe("6d ago");
    expect(formatRelativeTime(ago(7 * DAY), { now: NOW })).toBe("1w ago");
    expect(formatRelativeTime(ago(29 * DAY), { now: NOW })).toBe("4w ago");
    expect(formatRelativeTime(ago(30 * DAY), { now: NOW })).toBe("1mo ago");
    expect(formatRelativeTime(ago(364 * DAY), { now: NOW })).toBe("12mo ago");
    expect(formatRelativeTime(ago(365 * DAY), { now: NOW })).toBe("1y ago");
  });

  it("mirrors the same buckets into the future", () => {
    expect(formatRelativeTime(ahead(5 * MINUTE), { now: NOW })).toBe("in 5m");
    expect(formatRelativeTime(ahead(3 * HOUR), { now: NOW })).toBe("in 3h");
    expect(formatRelativeTime(ahead(2 * DAY), { now: NOW })).toBe("in 2d");
  });

  it("resolves seconds when asked", () => {
    expect(formatRelativeTime(ago(45 * SECOND), { now: NOW, seconds: true })).toBe("45s ago");
    expect(formatRelativeTime(ahead(45 * SECOND), { now: NOW, seconds: true })).toBe("in 45s");
  });

  it("carries minutes alongside hours when asked", () => {
    expect(formatRelativeTime(ahead(2 * HOUR + 15 * MINUTE), { now: NOW, compound: true })).toBe(
      "in 2h 15m",
    );
  });

  it("drops the compound remainder when it is zero", () => {
    expect(formatRelativeTime(ahead(2 * HOUR), { now: NOW, compound: true })).toBe("in 2h");
  });

  it("leaves buckets above hours alone under compound", () => {
    expect(formatRelativeTime(ago(3 * DAY + 4 * HOUR), { now: NOW, compound: true })).toBe(
      "3d ago",
    );
  });

  it("defaults 'now' to the current time", () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatRelativeTime("nope", { now: NOW })).toBe("");
  });
});

describe("formatRelativeDay", () => {
  it("names the recent buckets", () => {
    expect(formatRelativeDay("2026-06-08", NOW)).toBe("Today");
    expect(formatRelativeDay("2026-06-07", NOW)).toBe("Yesterday");
    expect(formatRelativeDay("2026-06-05", NOW)).toBe("3 days ago");
    expect(formatRelativeDay("2026-06-01", NOW)).toBe("Last week");
    expect(formatRelativeDay("2026-05-25", NOW)).toBe("2 weeks ago");
    expect(formatRelativeDay("2026-05-01", NOW)).toBe("Last month");
  });

  it("falls back to the plain day once the buckets run out", () => {
    expect(formatRelativeDay("2026-01-15", NOW)).toBe("2026-01-15");
  });

  it("uses UTC on both sides so the bucket never shifts with the reader", () => {
    const lateInTheDay = new Date("2026-06-08T23:00:00.000Z");
    expect(formatRelativeDay("2026-06-08", lateInTheDay)).toBe("Today");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatRelativeDay("nope", NOW)).toBe("");
  });
});
