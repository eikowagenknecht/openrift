/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { clearCollection, deleteCollection, resetCollections } from "./collections.js";

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
      lockByIds: vi.fn(async (ids: string[]) => ids),
      deleteBatchById,
    },
    cardTrades: {
      filterReservedCopyIds: vi.fn(async () => overrides.reservedIds ?? []),
      // The unfillable-trade sweep runs after every dispose; these fixtures
      // leave the actor with no pending trades, so it stops right here.
      listPendingForGiverPrinting: vi.fn(async () => []),
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

// ── resetCollections ────────────────────────────────────────────────────

interface ResetCopy {
  id: string;
  printingId: string;
  collectionId: string;
  collectionName: string;
}

function createResetMocks(
  overrides: {
    copies?: ResetCopy[];
    reservedCopyIds?: string[];
    loanedCopyIds?: string[];
    listIdsWithEntries?: string[];
    removedCopies?: number;
    removedCollections?: number;
    removedLists?: number;
  } = {},
) {
  const copies = overrides.copies ?? [];
  const listInPersonalCollections = vi.fn(async () => copies);
  const deleteAllInPersonalCollections = vi.fn(
    async () => overrides.removedCopies ?? copies.length,
  );
  const deleteAllPersonalExceptInbox = vi.fn(async () => overrides.removedCollections ?? 0);
  const ensureInbox = vi.fn(async () => "inbox-1");
  const listIdsWithEntries = vi.fn(async () => overrides.listIdsWithEntries ?? []);
  const deleteEmptyWithoutRules = vi.fn(async () => overrides.removedLists ?? 0);
  const filterReservedCopyIds = vi.fn(
    async (_copyIds: string[]) => overrides.reservedCopyIds ?? [],
  );
  const filterLoanedCopyIds = vi.fn(async (_copyIds: string[]) => overrides.loanedCopyIds ?? []);
  const insertEvents = vi.fn(async (_events: unknown[]) => {});

  const repos = {
    copies: { listInPersonalCollections, deleteAllInPersonalCollections },
    collections: { deleteAllPersonalExceptInbox, ensureInbox },
    lists: { listIdsWithEntries, deleteEmptyWithoutRules },
    cardTrades: { filterReservedCopyIds, listPendingForGiverPrinting: vi.fn(async () => []) },
    loans: { filterLoanedCopyIds },
    collectionEvents: { insert: insertEvents },
  } as unknown as Repos;

  return {
    repos,
    listInPersonalCollections,
    deleteAllInPersonalCollections,
    deleteAllPersonalExceptInbox,
    ensureInbox,
    listIdsWithEntries,
    deleteEmptyWithoutRules,
    filterReservedCopyIds,
    filterLoanedCopyIds,
    insertEvents,
  };
}

function resetCopy(n: number): ResetCopy {
  return {
    id: `copy-${n}`,
    printingId: `p-${n}`,
    collectionId: "col-1",
    collectionName: "Binder",
  };
}

describe("resetCollections", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("wipes copies, deletes non-inbox collections, ensures the inbox, and returns counts", async () => {
    const mocks = createResetMocks({
      copies: [resetCopy(1), resetCopy(2)],
      removedCopies: 2,
      removedCollections: 3,
      removedLists: 1,
    });
    const transact = mockTransact(mocks.repos);

    const result = await resetCollections(transact, "user-1");

    expect(result).toEqual({ removedCopies: 2, removedCollections: 3, removedLists: 1 });
    expect(mocks.deleteAllInPersonalCollections).toHaveBeenCalledWith("user-1");
    expect(mocks.deleteAllPersonalExceptInbox).toHaveBeenCalledWith("user-1");
    expect(mocks.ensureInbox).toHaveBeenCalledWith("user-1");
  });

  it("logs a removal event per copy before deleting", async () => {
    const mocks = createResetMocks({ copies: [resetCopy(1), resetCopy(2)] });
    const transact = mockTransact(mocks.repos);

    await resetCollections(transact, "user-1");

    expect(mocks.insertEvents).toHaveBeenCalledTimes(1);
    const events = mocks.insertEvents.mock.calls[0]![0] as any[];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      userId: "user-1",
      action: "removed",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: "col-1",
      fromCollectionName: "Binder",
    });
    // Events must be inserted while the copy FK still resolves.
    expect(mocks.insertEvents.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.deleteAllInPersonalCollections.mock.invocationCallOrder[0]!,
    );
  });

  it("logs no events and prunes no lists for a user with no copies", async () => {
    const mocks = createResetMocks({ copies: [], listIdsWithEntries: [] });
    const transact = mockTransact(mocks.repos);

    const result = await resetCollections(transact, "user-1");

    expect(mocks.insertEvents).not.toHaveBeenCalled();
    expect(mocks.deleteEmptyWithoutRules).toHaveBeenCalledWith("user-1", []);
    expect(result.removedCopies).toBe(0);
  });

  it("only prunes lists that had entries before the wipe", async () => {
    const mocks = createResetMocks({
      copies: [resetCopy(1)],
      listIdsWithEntries: ["list-1", "list-2"],
    });
    const transact = mockTransact(mocks.repos);

    await resetCollections(transact, "user-1");

    expect(mocks.listIdsWithEntries).toHaveBeenCalledWith("user-1");
    expect(mocks.deleteEmptyWithoutRules).toHaveBeenCalledWith("user-1", ["list-1", "list-2"]);
    // The snapshot must be taken before the copies are deleted.
    expect(mocks.listIdsWithEntries.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.deleteAllInPersonalCollections.mock.invocationCallOrder[0]!,
    );
  });

  it("refuses with 409 when a copy is reserved in an active trade", async () => {
    const mocks = createResetMocks({
      copies: [resetCopy(1)],
      reservedCopyIds: ["copy-1"],
    });
    const transact = mockTransact(mocks.repos);

    await expect(resetCollections(transact, "user-1")).rejects.toMatchObject({
      status: 409,
    });
    await expect(resetCollections(transact, "user-1")).rejects.toBeInstanceOf(AppError);
    expect(mocks.deleteAllInPersonalCollections).not.toHaveBeenCalled();
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("refuses with 409 when a copy is out on a loan", async () => {
    const mocks = createResetMocks({
      copies: [resetCopy(1)],
      loanedCopyIds: ["copy-1"],
    });
    const transact = mockTransact(mocks.repos);

    await expect(resetCollections(transact, "user-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.deleteAllInPersonalCollections).not.toHaveBeenCalled();
  });

  it("chunks guard checks and event inserts for large collections", async () => {
    const copies = Array.from({ length: 2500 }, (_, i) => resetCopy(i));
    const mocks = createResetMocks({ copies });
    const transact = mockTransact(mocks.repos);

    await resetCollections(transact, "user-1");

    // 2500 copies at a batch size of 1000 → 3 batches everywhere.
    expect(mocks.filterReservedCopyIds).toHaveBeenCalledTimes(3);
    expect(mocks.filterLoanedCopyIds).toHaveBeenCalledTimes(3);
    expect(mocks.insertEvents).toHaveBeenCalledTimes(3);
    expect(mocks.filterReservedCopyIds.mock.calls[0]![0] as string[]).toHaveLength(1000);
    expect(mocks.filterReservedCopyIds.mock.calls[2]![0] as string[]).toHaveLength(500);
  });
});
