/* oxlint-disable
   no-empty-function
   -- test file: mocks require empty fns */
import { describe, expect, it, vi } from "vitest";

import { printingEventsRepo } from "./printing-events.js";

function mockDb() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    onRef: vi.fn().mockReturnThis(),
    execute: vi.fn(async () => []),
  };

  return {
    insertInto: vi.fn(() => chain),
    selectFrom: vi.fn(() => chain),
    updateTable: vi.fn(() => chain),
    chain,
  };
}

describe("printingEventsRepo", () => {
  it("recordNew inserts a new event with just printingId", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordNew("p-1");

    expect(db.insertInto).toHaveBeenCalledWith("printingEvents");
    expect(db.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "new",
        printingId: "p-1",
        status: "pending",
        changes: null,
      }),
    );
  });

  it("recordChange skips when changes array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordChange("p-1", []);

    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it("recordChange inserts a changed event with diff data", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordChange("p-1", [{ field: "artist", from: "Old", to: "New" }]);

    expect(db.insertInto).toHaveBeenCalledWith("printingEvents");
    expect(db.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "changed",
        printingId: "p-1",
        changes: JSON.stringify([{ field: "artist", from: "Old", to: "New" }]),
      }),
    );
  });

  it("markSent skips when ids array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.markSent([]);

    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it("markRetry skips when ids array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.markRetry([]);

    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it("listByStatus skips the query when statuses array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    const result = await repo.listByStatus([]);

    expect(result).toEqual([]);
    expect(db.selectFrom).not.toHaveBeenCalled();
  });

  it("listByStatus filters by the provided statuses", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.listByStatus(["pending", "failed"]);

    expect(db.selectFrom).toHaveBeenCalledWith("printingEvents as pe");
    expect(db.chain.where).toHaveBeenCalledWith("pe.status", "in", ["pending", "failed"]);
  });

  it("retryFailed resets status and retry counter for the supplied ids", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.retryFailed(["a", "b"]);

    expect(db.updateTable).toHaveBeenCalledWith("printingEvents");
    expect(db.chain.set).toHaveBeenCalledWith({ status: "pending", retryCount: 0 });
    expect(db.chain.where).toHaveBeenCalledWith("id", "in", ["a", "b"]);
  });

  it("retryFailed skips when ids array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.retryFailed([]);

    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it("listByStatus parses the changes column when postgres.js returns it as a JSON string", async () => {
    const stringRow = {
      id: "evt-1",
      eventType: "changed",
      printingId: "p-1",
      changes: '[{"field":"artist","from":"Old","to":"New"}]',
      createdAt: new Date(),
      status: "pending",
      retryCount: 0,
      cardName: null,
      cardSlug: null,
      setName: null,
      shortCode: null,
      rarity: null,
      finish: null,
      finishLabel: null,
      artist: null,
      language: null,
      languageName: null,
      frontImageUrl: null,
    };
    const db = mockDb();
    db.chain.execute.mockResolvedValueOnce([stringRow]);
    const repo = printingEventsRepo(db as any);

    const [event] = await repo.listByStatus(["pending"]);

    expect(event.changes).toEqual([{ field: "artist", from: "Old", to: "New" }]);
  });

  it("listPending leaves null changes alone for new-printing events", async () => {
    const nullRow = {
      id: "evt-1",
      eventType: "new",
      printingId: "p-1",
      changes: null,
      createdAt: new Date(),
      cardName: null,
      cardSlug: null,
      setName: null,
      shortCode: null,
      rarity: null,
      finish: null,
      finishLabel: null,
      artist: null,
      language: null,
      languageName: null,
      frontImageUrl: null,
    };
    const db = mockDb();
    db.chain.execute.mockResolvedValueOnce([nullRow]);
    const repo = printingEventsRepo(db as any);

    const [event] = await repo.listPending();

    expect(event.changes).toBeNull();
  });
});
