/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { addCopies, disposeCopies, moveCopies } from "./copies.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

function createMockRepos(overrides: {
  inboxId?: string;
  writableCollections?: string[];
  insertedCopies?: {
    id: string;
    printingId: string;
    collectionId: string;
  }[];
  collections?: { id: string; name: string; groupId?: string | null }[];
  targetCollection?: { id: string; name: string } | undefined;
  fetchedCopies?: {
    id: string;
    printingId: string;
    collectionId: string;
    collectionName: string;
  }[];
  /** Copies pinned by a live (pending/reserved) trade. */
  reservedCopies?: string[];
  /** Copies still pinned by a completed trade whose giver sync is unresolved. */
  completedReservedCopies?: string[];
  loanedCopies?: string[];
}) {
  const targetExists = overrides.targetCollection !== undefined;
  const pins = [
    ...(overrides.reservedCopies ?? []).map((copyId) => ({
      copyId,
      tradeId: "trade-live",
      status: "reserved" as const,
    })),
    ...(overrides.completedReservedCopies ?? []).map((copyId) => ({
      copyId,
      tradeId: "trade-done",
      status: "completed" as const,
    })),
  ];
  const repos = {
    collections: {
      ensureInbox: () => Promise.resolve(overrides.inboxId ?? "inbox-id"),
      filterWritableByViewer: (ids: readonly string[]) => {
        const writable = new Set<string>(overrides.writableCollections);
        // The target collection is implicitly writable when provided —
        // mirrors the route's "you must have write access to the target".
        if (targetExists && overrides.targetCollection) {
          writable.add(overrides.targetCollection.id);
        }
        return Promise.resolve(ids.filter((id) => writable.has(id)));
      },
      listIdAndNameByIds: () => Promise.resolve(overrides.collections ?? []),
      listIdNameGroupByIds: () =>
        Promise.resolve(
          (overrides.collections ?? []).map((col) => ({
            id: col.id,
            name: col.name,
            groupId: col.groupId ?? null,
          })),
        ),
    },
    copies: {
      insertBatch: () => Promise.resolve(overrides.insertedCopies ?? []),
      listWithCollectionContext: () => Promise.resolve(overrides.fetchedCopies ?? []),
      lockByIds: (copyIds: string[]) => Promise.resolve(copyIds),
      moveBatchById: () => Promise.resolve(),
      deleteBatchById: () => Promise.resolve(),
    },
    collectionEvents: {
      insert: () => Promise.resolve(),
    },
    cardTrades: {
      filterReservedCopyIds: (copyIds: readonly string[]) =>
        Promise.resolve(
          pins.filter((pin) => copyIds.includes(pin.copyId)).map((pin) => pin.copyId),
        ),
      listReservationsForCopies: (copyIds: readonly string[]) =>
        Promise.resolve(pins.filter((pin) => copyIds.includes(pin.copyId))),
      // The unfillable sweep (ADR-019) runs after every move/dispose. These
      // fixtures leave the actor with no pending trades, so it stops here.
      listPendingForGiverPrinting: () => Promise.resolve([]),
    },
    loans: {
      filterLoanedCopyIds: (copyIds: readonly string[]) =>
        Promise.resolve((overrides.loanedCopies ?? []).filter((id) => copyIds.includes(id))),
    },
  } as unknown as Repos;

  return repos;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addCopies", () => {
  it("creates copies in the inbox when no collectionId specified", async () => {
    const repos = createMockRepos({
      insertedCopies: [{ id: "copy-1", printingId: "p-1", collectionId: "inbox-id" }],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [{ printingId: "p-1" }]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("copy-1");
    expect(result[0].collectionId).toBe("inbox-id");
    // Personal collection (inbox) → groupId null
    expect(result[0].groupId).toBeNull();
  });

  it("populates groupId from a group-owned collection", async () => {
    const repos = createMockRepos({
      writableCollections: ["group-col"],
      insertedCopies: [{ id: "copy-1", printingId: "p-1", collectionId: "group-col" }],
      collections: [{ id: "group-col", name: "Shared", groupId: "grp-9" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [
      { printingId: "p-1", collectionId: "group-col" },
    ]);

    expect(result[0].groupId).toBe("grp-9");
  });

  it("validates that explicit collections belong to the user", async () => {
    const repos = createMockRepos({
      inboxId: "inbox-id",
      writableCollections: ["col-1"],
    });
    const transact = mockTransact(repos);

    await expect(
      addCopies(repos, transact, "user-1", [
        { printingId: "p-1", collectionId: "col-1" },
        { printingId: "p-2", collectionId: "col-2" },
      ]),
    ).rejects.toThrow(AppError);
  });

  it("creates copies with explicit collection", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      insertedCopies: [{ id: "copy-1", printingId: "p-1", collectionId: "col-1" }],
      collections: [{ id: "col-1", name: "Main" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [
      { printingId: "p-1", collectionId: "col-1" },
    ]);

    expect(result[0].collectionId).toBe("col-1");
  });

  it("completes the full flow including event logging", async () => {
    const repos = createMockRepos({
      insertedCopies: [{ id: "copy-1", printingId: "p-1", collectionId: "inbox-id" }],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [{ printingId: "p-1" }]);
    expect(result).toHaveLength(1);
  });
});

describe("moveCopies", () => {
  it("throws NOT_FOUND if target collection does not exist", async () => {
    const repos = createMockRepos({ targetCollection: undefined });
    const transact = mockTransact(repos);

    await expect(moveCopies(repos, transact, "user-1", ["copy-1"], "bad-col")).rejects.toThrow(
      "Target collection not found",
    );
  });

  it("throws NOT_FOUND if some copies are not found", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "col-2", name: "Target" },
      collections: [{ id: "col-2", name: "Target" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await expect(
      moveCopies(repos, transact, "user-1", ["copy-1", "copy-missing"], "col-2"),
    ).rejects.toThrow("One or more copies not found");
  });

  it("moves a reserved copy between the owner's own collections", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "col-2", name: "Target" },
      collections: [{ id: "col-2", name: "Target" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
      reservedCopies: ["copy-1"],
    });
    const transact = mockTransact(repos);

    await expect(
      moveCopies(repos, transact, "user-1", ["copy-1"], "col-2"),
    ).resolves.toBeUndefined();
  });

  it("refuses to move a reserved copy into a group collection (ADR-019)", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "group-col", name: "Shared" },
      collections: [{ id: "group-col", name: "Shared", groupId: "grp-1" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
      reservedCopies: ["copy-1"],
    });
    const transact = mockTransact(repos);

    await expect(
      moveCopies(repos, transact, "user-1", ["copy-1"], "group-col"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("moves an unreserved copy into a group collection", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "group-col", name: "Shared" },
      collections: [{ id: "group-col", name: "Shared", groupId: "grp-1" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await expect(
      moveCopies(repos, transact, "user-1", ["copy-1"], "group-col"),
    ).resolves.toBeUndefined();
  });

  it("moves copies successfully", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "col-2", name: "Target" },
      collections: [{ id: "col-2", name: "Target" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await moveCopies(repos, transact, "user-1", ["copy-1"], "col-2");
  });
});

describe("disposeCopies", () => {
  it("throws NOT_FOUND if some copies are not found", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
        },
      ],
    });
    const transact = mockTransact(repos);

    await expect(disposeCopies(transact, "user-1", ["copy-1", "copy-missing"])).rejects.toThrow(
      "One or more copies not found",
    );
  });

  it("completes disposal flow including event logging", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
        },
      ],
    });
    const transact = mockTransact(repos);

    await disposeCopies(transact, "user-1", ["copy-1"]);
  });

  it("disposes multiple copies at once", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
        },
        {
          id: "copy-2",
          printingId: "p-2",
          collectionId: "col-1",
          collectionName: "Main",
        },
      ],
    });
    const transact = mockTransact(repos);

    await disposeCopies(transact, "user-1", ["copy-1", "copy-2"]);
  });

  it("rejects a copy reserved by a live trade (ADR-019)", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Main" },
      ],
      reservedCopies: ["copy-1"],
    });
    const transact = mockTransact(repos);

    await expect(disposeCopies(transact, "user-1", ["copy-1"])).rejects.toMatchObject({
      status: 409,
      message: "This card is reserved in an active trade — cancel the trade to free it.",
    });
  });

  it("points a completed trade's leftover pin at the sync, not at cancelling", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Main" },
      ],
      completedReservedCopies: ["copy-1"],
    });
    const transact = mockTransact(repos);

    await expect(disposeCopies(transact, "user-1", ["copy-1"])).rejects.toMatchObject({
      status: 409,
      message:
        "This card is still reserved by a completed trade. Resolve or skip that trade's sync to free it.",
    });
  });
});

describe("copy mutations sweep unfillable pending trades", () => {
  /**
   * Repos for the sweep wiring: one copy of `p-1`, one pending request for it,
   * and a supply read that reports the stack empty once the mutation ran.
   * @returns The stub repos plus the auto-cancel spy.
   */
  function sweepRepos() {
    const markAutoCancelled = vi.fn(() => Promise.resolve(1));
    const repos = {
      collections: {
        filterWritableByViewer: (ids: readonly string[]) => Promise.resolve([...ids]),
        listIdNameGroupByIds: () =>
          Promise.resolve([{ id: "col-2", name: "Target", groupId: null }]),
      },
      copies: {
        listWithCollectionContext: () =>
          Promise.resolve([
            { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Main" },
          ]),
        lockByIds: (copyIds: string[]) => Promise.resolve(copyIds),
        moveBatchById: () => Promise.resolve(),
        deleteBatchById: () => Promise.resolve(),
      },
      collectionEvents: { insert: () => Promise.resolve() },
      loans: { filterLoanedCopyIds: () => Promise.resolve([]) },
      cardTrades: {
        filterReservedCopyIds: () => Promise.resolve([]),
        listReservationsForCopies: () => Promise.resolve([]),
        listPendingForGiverPrinting: () =>
          Promise.resolve([
            { id: "trade-1", groupId: "group-1", quantity: 1, initiator: "receiver" },
          ]),
        markAutoCancelled,
      },
      friendGroupMatches: {
        // Read after the mutation: the giver no longer offers the printing.
        giverPrintingSupply: () => Promise.resolve({ unreservedCopyIds: [], hasAny: false }),
      },
    } as unknown as Repos;
    return { repos, markAutoCancelled };
  }

  it("disposing the backing copies cancels the pending trade (ADR-019)", async () => {
    const { repos, markAutoCancelled } = sweepRepos();

    await disposeCopies(mockTransact(repos), "user-1", ["copy-1"]);

    expect(markAutoCancelled).toHaveBeenCalledWith("trade-1");
  });

  it("moving the backing copies out of view cancels the pending trade", async () => {
    const { repos, markAutoCancelled } = sweepRepos();

    await moveCopies(repos, mockTransact(repos), "user-1", ["copy-1"], "col-2");

    expect(markAutoCancelled).toHaveBeenCalledWith("trade-1");
  });
});

describe("addCopies — additional branches", () => {
  it("deduplicates explicit collection IDs before validation", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1" },
        { id: "copy-2", printingId: "p-2", collectionId: "col-1" },
      ],
      collections: [{ id: "col-1", name: "Main" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [
      { printingId: "p-1", collectionId: "col-1" },
      { printingId: "p-2", collectionId: "col-1" },
    ]);

    expect(result).toHaveLength(2);
  });

  it("uses inbox when no collectionId provided", async () => {
    const repos = createMockRepos({
      insertedCopies: [{ id: "copy-1", printingId: "p-1", collectionId: "inbox-id" }],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [{ printingId: "p-1" }]);

    expect(result[0].collectionId).toBe("inbox-id");
  });
});

describe("moveCopies — additional branches", () => {
  it("calls moveBatch and logEvents with correct arguments", async () => {
    const repos = createMockRepos({
      writableCollections: ["col-1"],
      targetCollection: { id: "col-2", name: "Target" },
      collections: [{ id: "col-2", name: "Target" }],
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
        { id: "copy-2", printingId: "p-2", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await moveCopies(repos, transact, "user-1", ["copy-1", "copy-2"], "col-2");
  });
});
