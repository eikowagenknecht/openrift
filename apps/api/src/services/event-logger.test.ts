import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { logEvents } from "./event-logger.js";

function createMockRepos() {
  const insertSpy = vi.fn(async () => {});
  const repos = {
    collectionEvents: { insert: insertSpy },
  } as unknown as Repos;
  return { repos, insertSpy };
}

describe("logEvents", () => {
  it("inserts events with correct field mapping", async () => {
    const { repos, insertSpy } = createMockRepos();

    await logEvents(repos, [
      {
        userId: "user-1",
        action: "added",
        printingId: "p-1",
        copyId: "copy-1",
        toCollectionId: "col-1",
        toCollectionName: "Inbox",
      },
    ]);

    expect(insertSpy).toHaveBeenCalledWith([
      {
        userId: "user-1",
        action: "added",
        printingId: "p-1",
        copyId: "copy-1",
        fromCollectionId: null,
        fromCollectionName: null,
        toCollectionId: "col-1",
        toCollectionName: "Inbox",
      },
    ]);
  });

  it("defaults optional fields to null", async () => {
    const { repos, insertSpy } = createMockRepos();

    await logEvents(repos, [{ userId: "user-1", action: "added", printingId: "p-1" }]);

    const inserted = insertSpy.mock.calls[0][0][0];
    expect(inserted.copyId).toBeNull();
    expect(inserted.fromCollectionId).toBeNull();
    expect(inserted.fromCollectionName).toBeNull();
    expect(inserted.toCollectionId).toBeNull();
    expect(inserted.toCollectionName).toBeNull();
  });

  it("handles empty events array", async () => {
    const { repos, insertSpy } = createMockRepos();

    await logEvents(repos, []);

    expect(insertSpy).toHaveBeenCalledWith([]);
  });

  it("inserts multiple events at once", async () => {
    const { repos, insertSpy } = createMockRepos();

    await logEvents(repos, [
      { userId: "user-1", action: "added", printingId: "p-1" },
      { userId: "user-1", action: "removed", printingId: "p-2" },
    ]);

    expect(insertSpy.mock.calls[0][0]).toHaveLength(2);
  });
});
