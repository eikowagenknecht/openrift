import type { SetRelease } from "@openrift/shared/set-release";
import { describe, expect, it } from "vitest";

import { defaultPostDate, effectivePostDate } from "./printing-post-date-default";

const TODAY = "2026-09-08";
const dayRelease: SetRelease = { releasedAt: "2026-10-04", precision: "day" };
const quarterRelease: SetRelease = { releasedAt: "2026-04-01", precision: "quarter" };
const undated: SetRelease = { releasedAt: null, precision: null };

describe("defaultPostDate", () => {
  it("takes the release period for the released label", () => {
    expect(defaultPostDate("released", dayRelease, null, TODAY)).toBe("2026-10-04");
    expect(defaultPostDate("released", quarterRelease, null, TODAY)).toBe("2026-Q2");
  });

  it("takes today for the announced and collected labels", () => {
    expect(defaultPostDate("announced", dayRelease, null, TODAY)).toBe(TODAY);
    expect(defaultPostDate("collected", dayRelease, null, TODAY)).toBe(TODAY);
  });

  it("prefers the printing's announcement date for the announced label", () => {
    expect(defaultPostDate("announced", dayRelease, "2026-07-15", TODAY)).toBe("2026-07-15");
  });

  it("ignores the announcement date for the other labels", () => {
    expect(defaultPostDate("collected", dayRelease, "2026-07-15", TODAY)).toBe(TODAY);
    expect(defaultPostDate("released", dayRelease, "2026-07-15", TODAY)).toBe("2026-10-04");
  });

  it("has no released default when the printing has no release date", () => {
    expect(defaultPostDate("released", undated, null, TODAY)).toBeUndefined();
    expect(defaultPostDate("released", undefined, null, TODAY)).toBeUndefined();
  });

  it("still dates an announced post for a printing with no release date", () => {
    expect(defaultPostDate("announced", undated, null, TODAY)).toBe(TODAY);
  });

  it("falls back to the current UTC day when no today is given", () => {
    expect(defaultPostDate("announced", undated, null)).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe("effectivePostDate", () => {
  it("follows the label's default while the URL carries no date", () => {
    expect(effectivePostDate(undefined, "released", dayRelease, null, TODAY)).toBe("2026-10-04");
    expect(effectivePostDate(undefined, "collected", dayRelease, null, TODAY)).toBe(TODAY);
    expect(effectivePostDate(undefined, "announced", dayRelease, "2026-07-15", TODAY)).toBe(
      "2026-07-15",
    );
  });

  it("uses an explicit date whatever the label says", () => {
    expect(effectivePostDate("2026-01-15", "released", dayRelease, null, TODAY)).toBe("2026-01-15");
    expect(effectivePostDate("2026-Q3", "announced", dayRelease, "2026-07-15", TODAY)).toBe(
      "2026-Q3",
    );
  });

  it("shows no date once it is cleared", () => {
    expect(effectivePostDate("none", "released", dayRelease, null, TODAY)).toBeUndefined();
    expect(effectivePostDate("none", "announced", dayRelease, "2026-07-15", TODAY)).toBeUndefined();
  });
});
