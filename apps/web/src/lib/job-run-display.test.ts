import { describe, expect, it } from "vitest";

import { summarizeRunResult } from "./job-run-display";

describe("summarizeRunResult", () => {
  it("keeps the counters and drops everything else", () => {
    expect(summarizeRunResult({ pages: 4, upserted: 30, provider: "uvsgames" })).toBe(
      "4 pages · 30 upserted",
    );
  });

  it("leads with the requests a crawl spent, not the rows it read", () => {
    expect(summarizeRunResult({ pages: 31, rows: 1637, requests: 31 })).toBe(
      "31 requests · 31 pages · 1,637 rows",
    );
  });

  it("summarizes a run that stored nothing as nothing", () => {
    expect(summarizeRunResult(null)).toBe("");
    expect(summarizeRunResult({ provider: "uvsgames" })).toBe("");
  });

  it("stops at six counters so one run cannot fill the column", () => {
    const result = Object.fromEntries(
      Array.from({ length: 9 }, (_unused, index) => [`k${index}`, index]),
    );
    expect(summarizeRunResult(result).split(" · ")).toHaveLength(6);
  });

  it("keeps the requests even when nine other counters would crowd them out", () => {
    const result = Object.fromEntries([
      ...Array.from({ length: 9 }, (_unused, index) => [`k${index}`, index]),
      ["requests", 31],
    ]);
    expect(summarizeRunResult(result)).toContain("31 requests · ");
  });

  it("leads with the coverage warning, ahead of every counter", () => {
    expect(summarizeRunResult({ complete: false, skipped: 2, requests: 31 })).toBe(
      "incomplete, 2 skipped · 31 requests",
    );
  });

  it("keeps the skipped counter when the warning does not name it", () => {
    expect(
      summarizeRunResult({ complete: false, cancelRequested: true, skipped: 2, requests: 31 }),
    ).toBe("cancelled · 31 requests · 2 skipped");
  });

  it("names a cancel as a cancel rather than a gap in the source", () => {
    expect(summarizeRunResult({ complete: false, skipped: 4, cancelRequested: true })).toBe(
      "cancelled · 4 skipped",
    );
  });

  it("says nothing about a crawl that covered its window", () => {
    expect(summarizeRunResult({ complete: true })).toBe("");
  });

  it("says a partial crawl fell short even when it skipped nothing", () => {
    expect(summarizeRunResult({ complete: false, skipped: 0 })).toBe("incomplete · 0 skipped");
  });
});
