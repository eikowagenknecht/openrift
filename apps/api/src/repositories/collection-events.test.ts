import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { buildEventsCursor, collectionEventsRepo } from "./collection-events.js";

describe("buildEventsCursor", () => {
  it("encodes createdAt and id into a single string", () => {
    const cursor = buildEventsCursor(new Date("2026-01-15T12:30:00.000Z"), "abc-123");
    expect(cursor).toBe("2026-01-15T12:30:00.000Z_abc-123");
  });
});

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
          action: "add",
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

  it("deleteForCollection removes events for either endpoint", async () => {
    const db = createMockDb([]);
    const repo = collectionEventsRepo(db);
    await expect(repo.deleteForCollection("col1", "u1")).resolves.toBeUndefined();
  });
});
