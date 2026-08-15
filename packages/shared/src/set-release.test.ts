import { describe, expect, it } from "vitest";

import {
  earliestRelease,
  formatReleasePeriod,
  isReleased,
  isReleasedAnywhere,
  isReleasedIn,
  normalizeToPeriodStart,
  releasePeriodEnd,
  todayUtc,
} from "./set-release.js";
import type { SetRelease } from "./set-release.js";

const day = (releasedAt: string): SetRelease => ({ releasedAt, precision: "day" });
const TODAY = "2026-08-13";

describe("releasePeriodEnd", () => {
  it("returns the date itself at day precision", () => {
    expect(releasePeriodEnd(day("2025-10-31"))).toBe("2025-10-31");
  });

  it("returns the last day of the month", () => {
    expect(releasePeriodEnd({ releasedAt: "2026-03-01", precision: "month" })).toBe("2026-03-31");
  });

  it("handles February in a leap year", () => {
    expect(releasePeriodEnd({ releasedAt: "2028-02-01", precision: "month" })).toBe("2028-02-29");
  });

  it("returns the last day of the quarter", () => {
    expect(releasePeriodEnd({ releasedAt: "2026-04-01", precision: "quarter" })).toBe("2026-06-30");
  });

  it("returns the last day of the year", () => {
    expect(releasePeriodEnd({ releasedAt: "2026-01-01", precision: "year" })).toBe("2026-12-31");
  });

  it("returns null when undated", () => {
    expect(releasePeriodEnd({ releasedAt: null, precision: null })).toBeNull();
  });
});

describe("isReleased", () => {
  it("is true on the release day itself", () => {
    expect(isReleased(day(TODAY), TODAY)).toBe(true);
  });

  it("is false the day before release", () => {
    expect(isReleased(day("2026-08-14"), TODAY)).toBe(false);
  });

  it("waits for the whole period to finish at coarse precision", () => {
    const quarter: SetRelease = { releasedAt: "2026-07-01", precision: "quarter" };
    expect(isReleased(quarter, TODAY)).toBe(false);
    expect(isReleased(quarter, "2026-09-30")).toBe(true);
  });

  it("treats an undated release as unreleased", () => {
    expect(isReleased({ releasedAt: null, precision: null }, TODAY)).toBe(false);
  });

  it("treats a missing release as unreleased", () => {
    expect(isReleased(undefined, TODAY)).toBe(false);
  });

  it("defaults to today when no date is given", () => {
    expect(isReleased(day("2000-01-01"))).toBe(true);
    expect(isReleased(day("9999-01-01"))).toBe(false);
  });
});

describe("normalizeToPeriodStart", () => {
  it("leaves day precision alone", () => {
    expect(normalizeToPeriodStart(day("2026-05-17"))).toEqual(day("2026-05-17"));
  });

  it("snaps to the first of the month", () => {
    expect(normalizeToPeriodStart({ releasedAt: "2026-05-17", precision: "month" })).toEqual({
      releasedAt: "2026-05-01",
      precision: "month",
    });
  });

  it("snaps to the first day of the quarter", () => {
    expect(normalizeToPeriodStart({ releasedAt: "2026-05-17", precision: "quarter" })).toEqual({
      releasedAt: "2026-04-01",
      precision: "quarter",
    });
    expect(normalizeToPeriodStart({ releasedAt: "2026-12-31", precision: "quarter" })).toEqual({
      releasedAt: "2026-10-01",
      precision: "quarter",
    });
  });

  it("snaps to the first day of the year", () => {
    expect(normalizeToPeriodStart({ releasedAt: "2026-05-17", precision: "year" })).toEqual({
      releasedAt: "2026-01-01",
      precision: "year",
    });
  });

  it("leaves an undated release alone", () => {
    const tba: SetRelease = { releasedAt: null, precision: null };
    expect(normalizeToPeriodStart(tba)).toEqual(tba);
  });

  it("produces dates the period-end maths agrees with", () => {
    const normalized = normalizeToPeriodStart({ releasedAt: "2026-08-13", precision: "quarter" });
    expect(releasePeriodEnd(normalized)).toBe("2026-09-30");
  });
});

describe("isReleasedIn", () => {
  const releases = {
    EN: day("2025-10-31"),
    FR: day("2026-12-01"),
    KR: { releasedAt: null, precision: null },
  };

  it("resolves per language", () => {
    expect(isReleasedIn(releases, "EN", TODAY)).toBe(true);
    expect(isReleasedIn(releases, "FR", TODAY)).toBe(false);
    expect(isReleasedIn(releases, "KR", TODAY)).toBe(false);
  });

  it("treats a language with no row as unreleased", () => {
    expect(isReleasedIn(releases, "DE", TODAY)).toBe(false);
  });

  it("treats an empty release map as unreleased", () => {
    expect(isReleasedIn({}, "EN", TODAY)).toBe(false);
  });
});

describe("earliestRelease", () => {
  it("picks the earliest dated language", () => {
    const releases = { FR: day("2026-01-16"), EN: day("2025-10-31") };
    expect(earliestRelease(releases)?.releasedAt).toBe("2025-10-31");
  });

  it("ignores undated languages", () => {
    const releases = { KR: { releasedAt: null, precision: null }, EN: day("2025-10-31") };
    expect(earliestRelease(releases)?.releasedAt).toBe("2025-10-31");
  });

  it("returns undefined when nothing is dated", () => {
    expect(earliestRelease({ KR: { releasedAt: null, precision: null } })).toBeUndefined();
    expect(earliestRelease({})).toBeUndefined();
  });
});

describe("isReleasedAnywhere", () => {
  it("is true when one language is out", () => {
    expect(isReleasedAnywhere({ EN: day("2025-10-31"), FR: day("2026-12-01") }, TODAY)).toBe(true);
  });

  it("is false when every language is still pending", () => {
    expect(isReleasedAnywhere({ EN: day("2026-12-01") }, TODAY)).toBe(false);
    expect(isReleasedAnywhere({}, TODAY)).toBe(false);
  });
});

describe("formatReleasePeriod", () => {
  it("formats each precision", () => {
    expect(formatReleasePeriod(day("2025-10-31"))).toBe("2025-10-31");
    expect(formatReleasePeriod({ releasedAt: "2026-03-01", precision: "month" })).toBe("2026-03");
    expect(formatReleasePeriod({ releasedAt: "2026-04-01", precision: "quarter" })).toBe("2026-Q2");
    expect(formatReleasePeriod({ releasedAt: "2026-01-01", precision: "year" })).toBe("2026");
  });

  it("labels every quarter", () => {
    const quarters = ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"].map((releasedAt) =>
      formatReleasePeriod({ releasedAt, precision: "quarter" }),
    );
    expect(quarters).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
  });

  it("coarsens left to right from the same year, so periods sort", () => {
    expect(
      [
        formatReleasePeriod({ releasedAt: "2026-01-01", precision: "year" }),
        formatReleasePeriod({ releasedAt: "2026-04-01", precision: "quarter" }),
        formatReleasePeriod({ releasedAt: "2026-03-01", precision: "month" }),
        formatReleasePeriod(day("2026-03-15")),
      ].every((label) => label.startsWith("2026")),
    ).toBe(true);
  });

  it("falls back to TBA when undated or absent", () => {
    expect(formatReleasePeriod({ releasedAt: null, precision: null })).toBe("TBA");
    expect(formatReleasePeriod(undefined)).toBe("TBA");
  });
});

describe("todayUtc", () => {
  it("returns a calendar day in UTC", () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(todayUtc()).toBe(new Date().toISOString().slice(0, 10));
  });
});
