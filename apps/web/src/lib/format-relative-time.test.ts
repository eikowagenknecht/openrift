import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./format-relative-time";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("renders sub-minute as 'just now'", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe("just now");
  });

  it("renders minutes", () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe("1m ago");
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe("59m ago");
  });

  it("renders hours", () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe("1h ago");
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe("23h ago");
  });

  it("renders days then weeks", () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe("1d ago");
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe("6d ago");
    expect(formatRelativeTime(ago(7 * DAY), NOW)).toBe("1w ago");
    expect(formatRelativeTime(ago(21 * DAY), NOW)).toBe("3w ago");
  });

  it("renders months then years", () => {
    expect(formatRelativeTime(ago(30 * DAY), NOW)).toBe("1mo ago");
    expect(formatRelativeTime(ago(200 * DAY), NOW)).toBe("6mo ago");
    expect(formatRelativeTime(ago(365 * DAY), NOW)).toBe("1y ago");
    expect(formatRelativeTime(ago(800 * DAY), NOW)).toBe("2y ago");
  });

  it("treats future timestamps (clock skew) as 'just now'", () => {
    expect(formatRelativeTime(ago(-5 * MINUTE), NOW)).toBe("just now");
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
