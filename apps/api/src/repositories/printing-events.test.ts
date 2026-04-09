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
});
