/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { deleteCollection } from "./collections.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

function createMockRepos(
  overrides: {
    copies?: { id: string; printingId: string }[];
  } = {},
) {
  const copies = overrides.copies ?? [];
  const moveCopiesBetweenCollections = vi.fn(async () => {});
  const deleteByIdForUser = vi.fn(async () => {});
  const listCopiesInCollection = vi.fn(async () => copies);

  const repos = {
    collections: {
      listCopiesInCollection,
      moveCopiesBetweenCollections,
      deleteByIdForUser,
    },
    collectionEvents: {
      insert: vi.fn(async () => {}),
    },
  } as unknown as Repos;

  return {
    repos,
    listCopiesInCollection,
    moveCopiesBetweenCollections,
    deleteByIdForUser,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("deleteCollection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes an empty collection without moving copies", async () => {
    const { repos, moveCopiesBetweenCollections, deleteByIdForUser } = createMockRepos({
      copies: [],
    });
    const transact = mockTransact(repos);

    await deleteCollection(transact, {
      collectionId: "col-1",
      collectionName: "Old Collection",
      moveCopiesTo: "col-2",
      targetName: "Target",
      userId: "user-1",
    });

    expect(moveCopiesBetweenCollections).not.toHaveBeenCalled();
    expect(deleteByIdForUser).toHaveBeenCalledWith("col-1", "user-1");
  });

  it("moves copies to target collection before deleting", async () => {
    const { repos, moveCopiesBetweenCollections, deleteByIdForUser } = createMockRepos({
      copies: [
        { id: "copy-1", printingId: "p-1" },
        { id: "copy-2", printingId: "p-2" },
      ],
    });
    const transact = mockTransact(repos);

    await deleteCollection(transact, {
      collectionId: "col-1",
      collectionName: "Old Collection",
      moveCopiesTo: "col-2",
      targetName: "Target",
      userId: "user-1",
    });

    expect(moveCopiesBetweenCollections).toHaveBeenCalledWith("col-1", "col-2");
    expect(deleteByIdForUser).toHaveBeenCalledWith("col-1", "user-1");
  });

  it("logs move events when copies are moved", async () => {
    const { repos } = createMockRepos({
      copies: [{ id: "copy-1", printingId: "p-1" }],
    });
    const transact = mockTransact(repos);
    const insertSpy = (repos as any).collectionEvents.insert;

    await deleteCollection(transact, {
      collectionId: "col-1",
      collectionName: "Old Collection",
      moveCopiesTo: "col-2",
      targetName: "Target",
      userId: "user-1",
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const events = insertSpy.mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("moved");
    expect(events[0].userId).toBe("user-1");
  });

  it("does not log events when collection is empty", async () => {
    const { repos } = createMockRepos({ copies: [] });
    const transact = mockTransact(repos);
    const insertSpy = (repos as any).collectionEvents.insert;

    await deleteCollection(transact, {
      collectionId: "col-1",
      collectionName: "Empty",
      moveCopiesTo: "col-2",
      targetName: "Target",
      userId: "user-1",
    });

    expect(insertSpy).not.toHaveBeenCalled();
  });
});
