/* oxlint-disable no-restricted-imports -- api has no @/ alias */
import { describe, expect, it } from "vitest";

import { isValidIsoDate } from "./iso-date.js";

describe("isValidIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isValidIsoDate("2026-08-15")).toBe(true);
  });

  it("accepts a leap day in a leap year", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects a day the month does not have", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
  });

  it("rejects a month out of range", () => {
    expect(isValidIsoDate("2026-13-01")).toBe(false);
  });

  it("rejects an unpadded date", () => {
    expect(isValidIsoDate("2026-8-15")).toBe(false);
  });

  it("rejects a datetime", () => {
    expect(isValidIsoDate("2026-08-15T00:00:00Z")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidIsoDate("")).toBe(false);
  });

  it("rejects a non-date string", () => {
    expect(isValidIsoDate("not-a-date")).toBe(false);
  });
});
