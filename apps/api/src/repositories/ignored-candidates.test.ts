import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { ignoredCandidatesRepo } from "./ignored-candidates.js";

const CARD = { provider: "test", externalId: "ext-1", createdAt: new Date() };
const PRINTING = { provider: "test", externalId: "ext-1", finish: "normal", createdAt: new Date() };

describe("ignoredCandidatesRepo", () => {
  // ── Cards ──────────────────────────────────────────────────────────────────
  it("listIgnoredCards returns all ignored cards", async () => {
    const db = createMockDb([CARD]);
    expect(await ignoredCandidatesRepo(db).listIgnoredCards()).toEqual([CARD]);
  });

  it("getIgnoredCard returns a card when found", async () => {
    const db = createMockDb([CARD]);
    expect(await ignoredCandidatesRepo(db).getIgnoredCard("test", "ext-1")).toEqual(CARD);
  });

  it("getIgnoredCard returns undefined when not found", async () => {
    const db = createMockDb([]);
    expect(await ignoredCandidatesRepo(db).getIgnoredCard("test", "ext-1")).toBeUndefined();
  });

  it("ignoreCard inserts without throwing", async () => {
    const db = createMockDb([]);
    await expect(
      ignoredCandidatesRepo(db).ignoreCard({ provider: "test", externalId: "ext-1" }),
    ).resolves.toBeUndefined();
  });

  it("unignoreCard returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const result = await ignoredCandidatesRepo(db).unignoreCard("test", "ext-1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  // ── Printings ──────────────────────────────────────────────────────────────
  it("listIgnoredPrintings returns all ignored printings", async () => {
    const db = createMockDb([PRINTING]);
    expect(await ignoredCandidatesRepo(db).listIgnoredPrintings()).toEqual([PRINTING]);
  });

  it("getIgnoredPrinting returns a printing when found", async () => {
    const db = createMockDb([PRINTING]);
    expect(await ignoredCandidatesRepo(db).getIgnoredPrinting("test", "ext-1")).toEqual(PRINTING);
  });

  it("ignorePrinting inserts without throwing", async () => {
    const db = createMockDb([]);
    await expect(
      ignoredCandidatesRepo(db).ignorePrinting({
        provider: "test",
        externalId: "ext-1",
        finish: "normal",
      }),
    ).resolves.toBeUndefined();
  });

  it("unignorePrinting with finish value returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const result = await ignoredCandidatesRepo(db).unignorePrinting("test", "ext-1", "normal");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  it("unignorePrinting with null finish returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const result = await ignoredCandidatesRepo(db).unignorePrinting("test", "ext-1", null);
    expect(result).toEqual({ numDeletedRows: 1n });
  });
});
