import { describe, expect, it } from "bun:test";

import type { Logger } from "@openrift/shared/logger";

import { logFetchSummary, logUpsertCounts } from "./log";
import type { UpsertCounts } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const log = {
    info: (msg: string) => messages.push(msg),
  } as unknown as Logger;
  return { log, messages };
}

// ---------------------------------------------------------------------------
// logFetchSummary
// ---------------------------------------------------------------------------

describe("logFetchSummary", () => {
  it("logs groups, products, and prices counts", () => {
    const { log, messages } = makeMockLogger();
    logFetchSummary(log, { groups: 3, products: 50, prices: 120 }, 0);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("3 groups");
    expect(messages[0]).toContain("50 products");
    expect(messages[0]).toContain("120 prices");
  });

  it("appends ignored suffix when ignoredCount > 0", () => {
    const { log, messages } = makeMockLogger();
    logFetchSummary(log, { groups: 2, products: 10, prices: 8 }, 5);

    expect(messages[0]).toContain("5 ignored");
  });

  it("omits ignored suffix when ignoredCount is 0", () => {
    const { log, messages } = makeMockLogger();
    logFetchSummary(log, { groups: 2, products: 10, prices: 8 }, 0);

    expect(messages[0]).not.toContain("ignored");
  });

  it("handles zero counts", () => {
    const { log, messages } = makeMockLogger();
    logFetchSummary(log, { groups: 0, products: 0, prices: 0 }, 0);

    expect(messages[0]).toContain("0 groups");
    expect(messages[0]).toContain("0 products");
    expect(messages[0]).toContain("0 prices");
  });

  it("starts with Fetched: prefix", () => {
    const { log, messages } = makeMockLogger();
    logFetchSummary(log, { groups: 1, products: 2, prices: 3 }, 0);

    expect(messages[0]).toMatch(/^Fetched:/);
  });
});

// ---------------------------------------------------------------------------
// logUpsertCounts
// ---------------------------------------------------------------------------

describe("logUpsertCounts", () => {
  it("logs non-zero inserted counts for snapshots and staged", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 10, updated: 0, unchanged: 10 },
      staging: { total: 15, new: 3, updated: 0, unchanged: 12 },
    };
    logUpsertCounts(log, counts);

    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain("10 snapshots");
    expect(messages[0]).toContain("3 staged");
  });

  it("logs non-zero updated counts", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 0, updated: 5, unchanged: 15 },
      staging: { total: 15, new: 0, updated: 2, unchanged: 13 },
    };
    logUpsertCounts(log, counts);

    expect(messages[1]).toContain("5 snapshots");
    expect(messages[1]).toContain("2 staged");
  });

  it("logs non-zero unchanged counts", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 0, updated: 0, unchanged: 20 },
      staging: { total: 15, new: 0, updated: 0, unchanged: 15 },
    };
    logUpsertCounts(log, counts);

    expect(messages[2]).toContain("20 snapshots");
    expect(messages[2]).toContain("15 staged");
  });

  it("logs em dash when all counts are zero", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 0, new: 0, updated: 0, unchanged: 0 },
      staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
    };
    logUpsertCounts(log, counts);

    expect(messages[0]).toContain("\u2014");
    expect(messages[1]).toContain("\u2014");
    expect(messages[2]).toContain("\u2014");
  });

  it("shows only non-zero categories when mixed", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 5, new: 5, updated: 0, unchanged: 0 },
      staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
    };
    logUpsertCounts(log, counts);

    // Inserted line should have snapshots but not staged
    expect(messages[0]).toContain("5 snapshots");
    expect(messages[0]).not.toContain("staged");
  });

  it("shows only staged when snapshots are zero for a category", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 0, new: 0, updated: 0, unchanged: 0 },
      staging: { total: 10, new: 10, updated: 0, unchanged: 0 },
    };
    logUpsertCounts(log, counts);

    // Inserted line should have staged but not snapshots
    expect(messages[0]).toContain("10 staged");
    expect(messages[0]).not.toContain("snapshots");
  });

  it("logs Inserted/Updated/Unchanged prefixes", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 10, new: 3, updated: 4, unchanged: 3 },
      staging: { total: 10, new: 3, updated: 4, unchanged: 3 },
    };
    logUpsertCounts(log, counts);

    expect(messages[0]).toMatch(/^Inserted:/);
    expect(messages[1]).toMatch(/^Updated:/);
    expect(messages[2]).toMatch(/^Unchanged:/);
  });
});
