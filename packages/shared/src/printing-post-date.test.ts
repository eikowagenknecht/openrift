import { describe, expect, it } from "vitest";

import {
  formatPostDate,
  isPostDayDate,
  postDateFromQuery,
  releasePostDate,
} from "./printing-post-date.js";

describe("postDateFromQuery", () => {
  it("keeps a year, a quarter, a month and a day", () => {
    for (const value of ["2026", "2026-Q2", "2026-10", "2026-10-04"]) {
      expect(postDateFromQuery(value)).toBe(value);
    }
  });

  it("rejects a month outside 1 to 12", () => {
    expect(postDateFromQuery("2026-00")).toBeUndefined();
    expect(postDateFromQuery("2026-13")).toBeUndefined();
    expect(postDateFromQuery("2026-13-01")).toBeUndefined();
  });

  it("rejects a quarter outside 1 to 4", () => {
    expect(postDateFromQuery("2026-Q0")).toBeUndefined();
    expect(postDateFromQuery("2026-Q5")).toBeUndefined();
  });

  it("rejects a day the month does not have", () => {
    expect(postDateFromQuery("2026-02-29")).toBeUndefined();
    expect(postDateFromQuery("2026-04-31")).toBeUndefined();
    expect(postDateFromQuery("2026-10-00")).toBeUndefined();
  });

  it("accepts 29 February in a leap year", () => {
    expect(postDateFromQuery("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects anything that is not one of the four shapes", () => {
    for (const value of ["", "none", "today", "26-10-04", "2026-10-4", "2026-10-04T00:00:00Z"]) {
      expect(postDateFromQuery(value)).toBeUndefined();
    }
  });

  it("rejects a value that is not a string", () => {
    for (const value of [undefined, null, 2026, ["2026"], { date: "2026" }]) {
      expect(postDateFromQuery(value)).toBeUndefined();
    }
  });
});

describe("isPostDayDate", () => {
  it("is true only for a valid full date", () => {
    expect(isPostDayDate("2026-10-04")).toBe(true);
    expect(isPostDayDate("2026-10")).toBe(false);
    expect(isPostDayDate("2026-Q4")).toBe(false);
    expect(isPostDayDate("2026")).toBe(false);
    expect(isPostDayDate("2026-02-29")).toBe(false);
  });
});

describe("formatPostDate", () => {
  it("writes a day without a leading zero and with the month name", () => {
    expect(formatPostDate("2026-10-04")).toBe("4 October 2026");
    expect(formatPostDate("2026-01-31")).toBe("31 January 2026");
  });

  it("writes a month as the name and the year", () => {
    expect(formatPostDate("2026-10")).toBe("October 2026");
  });

  it("writes a quarter with the quarter first", () => {
    expect(formatPostDate("2026-Q2")).toBe("Q2 2026");
  });

  it("writes a year as itself", () => {
    expect(formatPostDate("2026")).toBe("2026");
  });

  it("returns an unrecognised value unchanged", () => {
    expect(formatPostDate("none")).toBe("none");
    expect(formatPostDate("2026-13")).toBe("2026-13");
  });
});

describe("releasePostDate", () => {
  it("takes the full date at day precision", () => {
    expect(releasePostDate({ releasedAt: "2026-10-04", precision: "day" })).toBe("2026-10-04");
  });

  it("takes the year and month at month precision", () => {
    expect(releasePostDate({ releasedAt: "2026-10-01", precision: "month" })).toBe("2026-10");
  });

  it("derives the quarter from the period's first month", () => {
    expect(releasePostDate({ releasedAt: "2026-04-01", precision: "quarter" })).toBe("2026-Q2");
    expect(releasePostDate({ releasedAt: "2026-01-01", precision: "quarter" })).toBe("2026-Q1");
    expect(releasePostDate({ releasedAt: "2026-10-01", precision: "quarter" })).toBe("2026-Q4");
  });

  it("takes the year alone at year precision", () => {
    expect(releasePostDate({ releasedAt: "2026-01-01", precision: "year" })).toBe("2026");
  });

  it("has nothing to show without a date or a precision", () => {
    expect(releasePostDate({ releasedAt: null, precision: null })).toBeUndefined();
    expect(releasePostDate({ releasedAt: "2026-10-04", precision: null })).toBeUndefined();
    expect(releasePostDate({ releasedAt: null, precision: "day" })).toBeUndefined();
  });

  it("produces values the query parser accepts", () => {
    for (const precision of ["day", "month", "quarter", "year"] as const) {
      const value = releasePostDate({ releasedAt: "2026-07-15", precision });
      expect(value).toBeDefined();
      expect(postDateFromQuery(value)).toBe(value);
    }
  });
});
