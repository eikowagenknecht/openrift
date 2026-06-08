import { describe, expect, it } from "vitest";

import { formatRelativeDate } from "./format-relative-date";

// `now` is fixed and the helper computes everything in UTC, so these assertions
// hold on any machine. Run under a hostile TZ (`TZ=America/Los_Angeles bun run
// test`) to confirm the buckets don't drift with the ambient timezone — a
// regression to local-time math is what produced the SSR hydration mismatch
// (React #418) this guards against.

describe("formatRelativeDate", () => {
  const now = new Date("2026-06-08T12:00:00Z");

  it('labels the same UTC day "Today"', () => {
    expect(formatRelativeDate("2026-06-08", now)).toBe("Today");
  });

  it('labels the previous UTC day "Yesterday"', () => {
    expect(formatRelativeDate("2026-06-07", now)).toBe("Yesterday");
  });

  it("counts days within the last week", () => {
    expect(formatRelativeDate("2026-06-05", now)).toBe("3 days ago");
  });

  it('collapses 7-13 days into "Last week"', () => {
    expect(formatRelativeDate("2026-06-01", now)).toBe("Last week");
  });

  it("counts whole weeks for 14-29 days", () => {
    expect(formatRelativeDate("2026-05-20", now)).toBe("2 weeks ago");
  });

  it('collapses 30-59 days into "Last month"', () => {
    expect(formatRelativeDate("2026-05-01", now)).toBe("Last month");
  });

  it("falls back to an en-US month and year for older dates", () => {
    expect(formatRelativeDate("2026-01-15", now)).toBe("January 2026");
  });

  it("anchors on the UTC day, not the viewer's local day", () => {
    // 03:00Z on the 9th is still the 8th across the Americas, but UTC pinning
    // makes the server and client agree that the entry from the 8th is
    // "Yesterday".
    expect(formatRelativeDate("2026-06-08", new Date("2026-06-09T03:00:00Z"))).toBe("Yesterday");
  });
});
