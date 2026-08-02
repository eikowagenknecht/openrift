import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { createMockDb } from "../test/mock-db.js";
import { collectionEventsRepo } from "./collection-events.js";

describe("collectionEventsRepo", () => {
  it("listForUser returns events without cursor", async () => {
    const rows = [{ id: "e1", action: "add", createdAt: new Date() }];
    const db = createMockDb(rows);
    const repo = collectionEventsRepo(db);
    expect(await repo.listForUser("u1", 20)).toEqual(rows);
  });

  it("listForUser applies cursor filter when provided", async () => {
    const db = createMockDb([]);
    const repo = collectionEventsRepo(db);
    expect(await repo.listForUser("u1", 20, "2026-01-01T00:00:00.000Z_e-last")).toEqual([]);
  });

  // Regression: the cursor parser used to pass an unparseable cursor straight
  // into `new Date(...)` and let the resulting Invalid Date reach the Kysely
  // query, producing an INTERNAL_ERROR 500. The query schema now rejects
  // malformed cursors before they get this far, but keysetCursorPredicate also
  // guards, so any unvalidated caller fails with a 400 AppError instead.
  it("listForUser rejects an unparseable cursor", () => {
    const db = createMockDb([]);
    const repo = collectionEventsRepo(db);
    expect(() => repo.listForUser("u1", 20, "not-a-date")).toThrow(AppError);
    try {
      repo.listForUser("u1", 20, "not-a-date");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
    }
  });

  it("insert is a no-op for empty array", async () => {
    const db = createMockDb([]);
    const repo = collectionEventsRepo(db);
    await expect(repo.insert([])).resolves.toBeUndefined();
  });

  it("insert inserts items", async () => {
    const db = createMockDb([]);
    const repo = collectionEventsRepo(db);
    await expect(
      repo.insert([
        {
          userId: "u1",
          action: "added",
          printingId: "p1",
          copyId: "c1",
          fromCollectionId: null,
          fromCollectionName: null,
          toCollectionId: "col1",
          toCollectionName: "Inbox",
        },
      ]),
    ).resolves.toBeUndefined();
  });
});
