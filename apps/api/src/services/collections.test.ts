/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { clearCollection, deleteCollection } from "./collections.js";

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

// ── clearCollection ─────────────────────────────────────────────────────

function createClearMockRepos(
  overrides: {
    copies?: { id: string; printingId: string }[];
    reservedIds?: string[];
    loanedIds?: string[];
  } = {},
) {
  const copies = overrides.copies ?? [];
  const deleteBatchById = vi.fn(async () => {});
  const insert = vi.fn(async () => {});

  const repos = {
    collections: {
      listCopiesInCollection: vi.fn(async () => copies),
      // disposeCopiesInTransaction re-checks write access on the source
      // collections; every source is writable in these unit tests.
      filterWritableByViewer: vi.fn(async (ids: string[]) => ids),
    },
    copies: {
      listWithCollectionContext: vi.fn(async (ids: string[]) =>
        copies
          .filter((copy) => ids.includes(copy.id))
          .map((copy) => ({ ...copy, collectionId: "col-1", collectionName: "Inbox" })),
      ),
      deleteBatchById,
    },
    cardTrades: {
      filterReservedCopyIds: vi.fn(async () => overrides.reservedIds ?? []),
    },
    loans: {
      filterLoanedCopyIds: vi.fn(async () => overrides.loanedIds ?? []),
    },
    collectionEvents: {
      insert,
    },
  } as unknown as Repos;

  return { repos, deleteBatchById, insert };
}

describe("clearCollection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns zero counts and disposes nothing for an empty collection", async () => {
    const { repos, deleteBatchById, insert } = createClearMockRepos({ copies: [] });

    const result = await clearCollection(mockTransact(repos), {
      collectionId: "col-1",
      userId: "user-1",
    });

    expect(result).toEqual({ removedCount: 0, keptCopyIds: [] });
    expect(deleteBatchById).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("disposes every copy and logs removed events", async () => {
    const { repos, deleteBatchById, insert } = createClearMockRepos({
      copies: [
        { id: "copy-1", printingId: "p-1" },
        { id: "copy-2", printingId: "p-2" },
      ],
    });

    const result = await clearCollection(mockTransact(repos), {
      collectionId: "col-1",
      userId: "user-1",
    });

    expect(result).toEqual({ removedCount: 2, keptCopyIds: [] });
    expect(deleteBatchById).toHaveBeenCalledWith(["copy-1", "copy-2"]);
    const events = (insert as any).mock.calls[0][0];
    expect(events).toHaveLength(2);
    expect(events[0].action).toBe("removed");
    expect(events[0].userId).toBe("user-1");
  });

  it("keeps copies pinned by trades or loans and reports them back", async () => {
    const { repos, deleteBatchById } = createClearMockRepos({
      copies: [
        { id: "copy-1", printingId: "p-1" },
        { id: "copy-2", printingId: "p-2" },
        { id: "copy-3", printingId: "p-3" },
      ],
      reservedIds: ["copy-1"],
      loanedIds: ["copy-2"],
    });

    const result = await clearCollection(mockTransact(repos), {
      collectionId: "col-1",
      userId: "user-1",
    });

    expect(result.removedCount).toBe(1);
    expect(result.keptCopyIds.toSorted()).toEqual(["copy-1", "copy-2"]);
    expect(deleteBatchById).toHaveBeenCalledWith(["copy-3"]);
  });

  it("disposes nothing when every copy is pinned", async () => {
    const { repos, deleteBatchById, insert } = createClearMockRepos({
      copies: [{ id: "copy-1", printingId: "p-1" }],
      reservedIds: ["copy-1"],
    });

    const result = await clearCollection(mockTransact(repos), {
      collectionId: "col-1",
      userId: "user-1",
    });

    expect(result).toEqual({ removedCount: 0, keptCopyIds: ["copy-1"] });
    expect(deleteBatchById).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
