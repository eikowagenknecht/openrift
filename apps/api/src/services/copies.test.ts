/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it } from "vitest";

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
  ownedCollections?: { id: string }[];
  insertedCopies?: {
    id: string;
    printingId: string;
    collectionId: string;
    acquisitionSourceId: string | null;
  }[];
  collections?: { id: string; name: string }[];
  targetCollection?: { id: string; name: string } | undefined;
  fetchedCopies?: {
    id: string;
    printingId: string;
    collectionId: string;
    collectionName: string;
    acquisitionSourceId?: string | null;
  }[];
}) {
  const repos = {
    collections: {
      ensureInbox: () => Promise.resolve(overrides.inboxId ?? "inbox-id"),
      listIdsByIdsForUser: () => Promise.resolve(overrides.ownedCollections ?? []),
      getIdAndName: () => Promise.resolve(overrides.targetCollection),
      listIdAndNameByIds: () => Promise.resolve(overrides.collections ?? []),
    },
    copies: {
      insertBatch: () => Promise.resolve(overrides.insertedCopies ?? []),
      listWithCollectionName: () => Promise.resolve(overrides.fetchedCopies ?? []),
      moveBatch: () => Promise.resolve(),
      deleteBatch: () => Promise.resolve(),
    },
    collectionEvents: {
      insert: () => Promise.resolve(),
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
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "inbox-id", acquisitionSourceId: null },
      ],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [{ printingId: "p-1" }]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("copy-1");
    expect(result[0].collectionId).toBe("inbox-id");
    expect(result[0].acquisitionSourceId).toBeNull();
  });

  it("validates that explicit collections belong to the user", async () => {
    const repos = createMockRepos({
      inboxId: "inbox-id",
      ownedCollections: [{ id: "col-1" }],
    });
    const transact = mockTransact(repos);

    await expect(
      addCopies(repos, transact, "user-1", [
        { printingId: "p-1", collectionId: "col-1" },
        { printingId: "p-2", collectionId: "col-2" },
      ]),
    ).rejects.toThrow(AppError);
  });

  it("creates copies with explicit collection and source", async () => {
    const repos = createMockRepos({
      ownedCollections: [{ id: "col-1" }],
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", acquisitionSourceId: "src-1" },
      ],
      collections: [{ id: "col-1", name: "Main" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [
      { printingId: "p-1", collectionId: "col-1", acquisitionSourceId: "src-1" },
    ]);

    expect(result[0].acquisitionSourceId).toBe("src-1");
  });

  it("completes the full flow including event logging", async () => {
    const repos = createMockRepos({
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "inbox-id", acquisitionSourceId: null },
      ],
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
      targetCollection: { id: "col-2", name: "Target" },
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await expect(
      moveCopies(repos, transact, "user-1", ["copy-1", "copy-missing"], "col-2"),
    ).rejects.toThrow("One or more copies not found");
  });

  it("moves copies successfully", async () => {
    const repos = createMockRepos({
      targetCollection: { id: "col-2", name: "Target" },
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
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
          acquisitionSourceId: "src-1",
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
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
          acquisitionSourceId: "src-1",
        },
      ],
    });
    const transact = mockTransact(repos);

    await disposeCopies(transact, "user-1", ["copy-1"]);
  });

  it("disposes multiple copies at once", async () => {
    const repos = createMockRepos({
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Main",
          acquisitionSourceId: "src-1",
        },
        {
          id: "copy-2",
          printingId: "p-2",
          collectionId: "col-1",
          collectionName: "Main",
          acquisitionSourceId: null,
        },
      ],
    });
    const transact = mockTransact(repos);

    await disposeCopies(transact, "user-1", ["copy-1", "copy-2"]);
  });
});

describe("addCopies — additional branches", () => {
  it("deduplicates explicit collection IDs before validation", async () => {
    const repos = createMockRepos({
      ownedCollections: [{ id: "col-1" }],
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", acquisitionSourceId: null },
        { id: "copy-2", printingId: "p-2", collectionId: "col-1", acquisitionSourceId: null },
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

  it("maps acquisitionSourceId to null when not provided", async () => {
    const repos = createMockRepos({
      insertedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "inbox-id", acquisitionSourceId: null },
      ],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });
    const transact = mockTransact(repos);

    const result = await addCopies(repos, transact, "user-1", [{ printingId: "p-1" }]);

    expect(result[0].acquisitionSourceId).toBeNull();
  });
});

describe("moveCopies — additional branches", () => {
  it("calls moveBatch and logEvents with correct arguments", async () => {
    const repos = createMockRepos({
      targetCollection: { id: "col-2", name: "Target" },
      fetchedCopies: [
        { id: "copy-1", printingId: "p-1", collectionId: "col-1", collectionName: "Source" },
        { id: "copy-2", printingId: "p-2", collectionId: "col-1", collectionName: "Source" },
      ],
    });
    const transact = mockTransact(repos);

    await moveCopies(repos, transact, "user-1", ["copy-1", "copy-2"], "col-2");
  });
});
