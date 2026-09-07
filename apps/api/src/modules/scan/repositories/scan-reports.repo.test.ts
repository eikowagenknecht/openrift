import { describe, expect, it } from "vitest";

import { createMockDb } from "../../../test/mock-db.js";
import { scanReportsRepo } from "./scan-reports.js";

describe("scanReportsRepo", () => {
  it("countRecentByUser returns the counted rows", async () => {
    const db = createMockDb([{ count: "3" }]);
    const repo = scanReportsRepo(db);
    expect(await repo.countRecentByUser("u1", new Date(0))).toBe(3);
  });

  it("countRecentByUser reports zero when the query returns nothing", async () => {
    const db = createMockDb([]);
    const repo = scanReportsRepo(db);
    expect(await repo.countRecentByUser("u1", new Date(0))).toBe(0);
  });

  it("referenceExists is true when a row carries the reference", async () => {
    const db = createMockDb([{ id: "sr-1" }]);
    const repo = scanReportsRepo(db);
    expect(await repo.referenceExists("SC-ABCD")).toBe(true);
  });

  it("referenceExists is false when no row carries the reference", async () => {
    const db = createMockDb([]);
    const repo = scanReportsRepo(db);
    expect(await repo.referenceExists("SC-ABCD")).toBe(false);
  });

  it("insert writes the report", async () => {
    const db = createMockDb([]);
    const repo = scanReportsRepo(db);
    await expect(
      repo.insert({
        userId: "u1",
        reference: "SC-ABCD",
        note: null,
        userAgent: null,
        journal: [{ t: 1, type: "scan" }],
      }),
    ).resolves.toBeUndefined();
  });
});
