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
    execute: vi.fn(async () => []),
    executeTakeFirst: vi.fn(async () => undefined),
  };

  return {
    insertInto: vi.fn(() => chain),
    selectFrom: vi.fn(() => chain),
    updateTable: vi.fn(() => chain),
    chain,
  };
}

describe("printingEventsRepo", () => {
  it("recordNewPrinting inserts a new event", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordNewPrinting({
      printingId: "p-1",
      cardName: "Test Card",
      setName: "Origins",
      shortCode: "OGN-001",
      rarity: "Common",
      finish: "normal",
      artist: "Artist A",
      language: "EN",
    });

    expect(db.insertInto).toHaveBeenCalledWith("printingEvents");
    expect(db.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "new",
        printingId: "p-1",
        cardName: "Test Card",
        status: "pending",
      }),
    );
  });

  it("recordPrintingChange skips when changes array is empty", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordPrintingChange({
      printingId: "p-1",
      cardName: "Test Card",
      changes: [],
    });

    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it("recordPrintingChange inserts a changed event with diff data", async () => {
    const db = mockDb();
    const repo = printingEventsRepo(db as any);

    await repo.recordPrintingChange({
      printingId: "p-1",
      cardName: "Test Card",
      shortCode: "OGN-001",
      changes: [{ field: "artist", from: "Old", to: "New" }],
    });

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
