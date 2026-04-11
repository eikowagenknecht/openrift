import { describe, expect, it } from "vitest";

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
    expect(await repo.listForUser("u1", 20, "2026-01-01T00:00:00Z")).toEqual([]);
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
