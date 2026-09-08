import { describe, expect, it } from "vitest";

import {
  deskPrintingPeriod,
  deskPrintingRelease,
  deskPrintingStatus,
} from "./printing-desk-status";

const TODAY = "2026-09-07";

describe("deskPrintingStatus", () => {
  it("is announced when there is no date yet", () => {
    expect(deskPrintingStatus({ releasedAt: null, releasePrecision: null }, TODAY)).toBe(
      "announced",
    );
  });

  it("is announced when a date is set but the precision is missing", () => {
    expect(deskPrintingStatus({ releasedAt: "2026-01-01", releasePrecision: null }, TODAY)).toBe(
      "announced",
    );
  });

  it("is released once a day-precise date has passed", () => {
    expect(deskPrintingStatus({ releasedAt: "2026-09-06", releasePrecision: "day" }, TODAY)).toBe(
      "released",
    );
  });

  it("is released on the day itself", () => {
    expect(deskPrintingStatus({ releasedAt: TODAY, releasePrecision: "day" }, TODAY)).toBe(
      "released",
    );
  });

  it("is announced while a day-precise date is still ahead", () => {
    expect(deskPrintingStatus({ releasedAt: "2026-09-08", releasePrecision: "day" }, TODAY)).toBe(
      "announced",
    );
  });

  it("waits for a month period to run out before calling it released", () => {
    expect(deskPrintingStatus({ releasedAt: "2026-09-01", releasePrecision: "month" }, TODAY)).toBe(
      "announced",
    );
    expect(deskPrintingStatus({ releasedAt: "2026-08-01", releasePrecision: "month" }, TODAY)).toBe(
      "released",
    );
  });

  it("waits for a year period to run out", () => {
    expect(deskPrintingStatus({ releasedAt: "2026-01-01", releasePrecision: "year" }, TODAY)).toBe(
      "announced",
    );
    expect(deskPrintingStatus({ releasedAt: "2025-01-01", releasePrecision: "year" }, TODAY)).toBe(
      "released",
    );
  });
});

describe("deskPrintingRelease", () => {
  it("renames the row's precision field onto the shared release shape", () => {
    expect(deskPrintingRelease({ releasedAt: "2026-03-01", releasePrecision: "month" })).toEqual({
      releasedAt: "2026-03-01",
      precision: "month",
    });
  });
});

describe("deskPrintingPeriod", () => {
  it("reads TBA when there is no date", () => {
    expect(deskPrintingPeriod({ releasedAt: null, releasePrecision: null })).toBe("TBA");
  });

  it("shows the period at the stated precision", () => {
    expect(deskPrintingPeriod({ releasedAt: "2026-03-01", releasePrecision: "month" })).toBe(
      "2026-03",
    );
    expect(deskPrintingPeriod({ releasedAt: "2026-03-14", releasePrecision: "day" })).toBe(
      "2026-03-14",
    );
    expect(deskPrintingPeriod({ releasedAt: "2026-01-01", releasePrecision: "year" })).toBe("2026");
  });
});
