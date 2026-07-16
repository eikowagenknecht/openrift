import { describe, expect, it } from "vitest";

import { dateLeafParts, formatAbsoluteDate } from "./format-date";

// These assertions are timezone-independent by design: the helper pins
// `timeZone: "UTC"` and the `en-US` locale. Run under a hostile TZ
// (`TZ=America/Los_Angeles bun run test`) to confirm the output never shifts —
// without the pins, the date-only and early-UTC cases below would render the
// previous calendar day in a negative-offset zone, which is the SSR hydration
// mismatch (React #418) this guards against.

describe("formatAbsoluteDate", () => {
  const longOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  it("formats a date-only string as its UTC calendar day", () => {
    expect(formatAbsoluteDate("2026-06-08", longOptions)).toBe("June 8, 2026");
  });

  it("keeps a late-in-the-day UTC instant on the same calendar day", () => {
    expect(formatAbsoluteDate("2026-06-08T23:30:00Z", longOptions)).toBe("June 8, 2026");
  });

  it("keeps an early UTC instant on the same calendar day", () => {
    // 00:30Z is the previous day in the Americas; UTC pinning keeps it June 8.
    expect(formatAbsoluteDate("2026-06-08T00:30:00Z", longOptions)).toBe("June 8, 2026");
  });

  it("uses the en-US month name regardless of the ambient locale", () => {
    expect(formatAbsoluteDate("2026-01-15", { month: "long", year: "numeric" })).toBe(
      "January 2026",
    );
  });

  it("supports a short format", () => {
    expect(
      formatAbsoluteDate("2026-01-05", { year: "numeric", month: "short", day: "numeric" }),
    ).toBe("Jan 5, 2026");
  });

  it("defaults to the en-US numeric format", () => {
    expect(formatAbsoluteDate("2026-06-08")).toBe("6/8/2026");
  });
});

describe("dateLeafParts", () => {
  it("splits an instant into an uppercase short month and a day number", () => {
    // Noon UTC keeps the local calendar day stable across test-runner timezones.
    const parts = dateLeafParts("2026-07-13T12:00:00Z");
    expect(parts.month).toBe(parts.month.toUpperCase());
    expect(parts.month.length).toBeGreaterThan(1);
    expect(parts.day).toBe("13");
  });
});
