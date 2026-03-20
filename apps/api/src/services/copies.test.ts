/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { addCopies, disposeCopies, moveCopies } from "./copies.js";

// ---------------------------------------------------------------------------
// Mock DB builder — handles calls from copies.ts, activity-logger.ts, and inbox.ts
// ---------------------------------------------------------------------------

function createMockDb(
  overrides: {
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
  } = {},
) {
  const inboxId = overrides.inboxId ?? "inbox-id";

  // Track tables being queried within the transaction
  function makeTrx() {
    const insertTracker = new Map<string, unknown[]>();

    function makeInsertChain(table: string) {
      const chain: Record<string, any> = {};
      for (const method of ["select", "where", "set", "onConflict", "doNothing"]) {
        chain[method] = () => chain;
      }
      chain.values = (vals: unknown) => {
        if (!insertTracker.has(table)) {
          insertTracker.set(table, []);
        }
        // oxlint-disable-next-line typescript/no-non-null-assertion -- guaranteed by set above
        insertTracker.get(table)!.push(vals);
        return chain;
      };
      chain.returning = () => chain;
      chain.execute = () => {
        if (table === "copies") {
          return Promise.resolve(overrides.insertedCopies ?? []);
        }
        return Promise.resolve([]);
      };
      chain.executeTakeFirstOrThrow = () => Promise.resolve({ id: "act-1" });
      return chain;
    }

    let selectCount = 0;
    function makeSelectChain() {
      selectCount++;
      const chain: Record<string, any> = {};
      for (const method of ["select", "where", "innerJoin", "orderBy"]) {
        chain[method] = () => chain;
      }
      // For addCopies: first select is collections (names), second is from createActivity
      // For moveCopies: first select is copies, second is from createActivity
      // For disposeCopies: first select is copies, second is from createActivity
      chain.execute = () => {
        // Return fetchedCopies if available (moveCopies/disposeCopies)
        if (selectCount === 1 && overrides.fetchedCopies) {
          return Promise.resolve(overrides.fetchedCopies);
        }
        // Return collections for name lookup
        if (overrides.collections) {
          return Promise.resolve(overrides.collections);
        }
        return Promise.resolve([]);
      };
      chain.executeTakeFirst = () => Promise.resolve(undefined);
      return chain;
    }

    const trx: Record<string, any> = {
      insertInto: (table: string) => makeInsertChain(table),
      selectFrom: () => makeSelectChain(),
      updateTable: () => {
        const chain: Record<string, any> = {};
        for (const method of ["set", "where"]) {
          chain[method] = () => chain;
        }
        chain.execute = () => Promise.resolve([]);
        return chain;
      },
      deleteFrom: () => {
        const chain: Record<string, any> = {};
        chain.where = () => chain;
        chain.execute = () => Promise.resolve([]);
        return chain;
      },
    };

    return { trx, insertTracker };
  }

  // DB-level select handling (outside transaction)
  // Track queries to return context-appropriate results
  const selectResults: {
    executeTakeFirst: any;
    execute: any;
  }[] = [];

  // Build the queue of expected db.selectFrom results based on the scenario:
  // addCopies flow: ensureInbox(executeTakeFirst) → owned collections check(execute)
  // moveCopies flow: target collection(executeTakeFirst)
  // disposeCopies flow: (no db.selectFrom, goes straight to transaction)
  if ("targetCollection" in overrides) {
    // moveCopies scenario: single selectFrom for target check
    selectResults.push({
      executeTakeFirst: overrides.targetCollection,
      execute: [],
    });
  } else {
    // addCopies scenario: inbox check then owned collections check
    selectResults.push({
      executeTakeFirst: { id: inboxId },
      execute: overrides.ownedCollections ?? [],
    });
    selectResults.push({
      executeTakeFirst: undefined,
      execute: overrides.ownedCollections ?? [],
    });
  }

  let dbSelectCount = 0;
  const { trx, insertTracker } = makeTrx();

  const db: Record<string, any> = {
    selectFrom: () => {
      const resultSet = selectResults[dbSelectCount] ?? {
        executeTakeFirst: undefined,
        execute: [],
      };
      dbSelectCount++;
      const chain: Record<string, any> = {};
      for (const method of ["select", "where", "onConflict", "doNothing"]) {
        chain[method] = () => chain;
      }
      chain.executeTakeFirst = () => Promise.resolve(resultSet.executeTakeFirst);
      chain.executeTakeFirstOrThrow = () => Promise.resolve(resultSet.executeTakeFirst);
      chain.execute = () => Promise.resolve(resultSet.execute);
      return chain;
    },
    // ensureInbox may call db.insertInto("collections")
    insertInto: () => {
      const chain: Record<string, any> = {};
      for (const method of ["values", "onConflict", "doNothing", "returning"]) {
        chain[method] = () => chain;
      }
      chain.executeTakeFirst = () => Promise.resolve(undefined);
      return chain;
    },
    transaction: () => ({
      execute: (fn: (t: any) => Promise<any>) => fn(trx),
    }),
  };

  return { db, insertTracker };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addCopies", () => {
  it("creates copies in the inbox when no collectionId specified", async () => {
    const { db } = createMockDb({
      insertedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "inbox-id",
          acquisitionSourceId: null,
        },
      ],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });

    const result = await addCopies(db as any, "user-1", [{ printingId: "p-1" }]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("copy-1");
    expect(result[0].collectionId).toBe("inbox-id");
    expect(result[0].acquisitionSourceId).toBeNull();
  });

  it("validates that explicit collections belong to the user", async () => {
    const { db } = createMockDb({
      inboxId: "inbox-id",
      ownedCollections: [{ id: "col-1" }],
    });

    await expect(
      addCopies(db as any, "user-1", [
        { printingId: "p-1", collectionId: "col-1" },
        { printingId: "p-2", collectionId: "col-2" },
      ]),
    ).rejects.toThrow(AppError);
  });

  it("creates copies with explicit collection and source", async () => {
    const { db } = createMockDb({
      ownedCollections: [{ id: "col-1" }],
      insertedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          acquisitionSourceId: "src-1",
        },
      ],
      collections: [{ id: "col-1", name: "Main" }],
    });

    const result = await addCopies(db as any, "user-1", [
      { printingId: "p-1", collectionId: "col-1", acquisitionSourceId: "src-1" },
    ]);

    expect(result[0].acquisitionSourceId).toBe("src-1");
  });

  it("completes the full flow including activity logging", async () => {
    const { db } = createMockDb({
      insertedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "inbox-id",
          acquisitionSourceId: null,
        },
      ],
      collections: [{ id: "inbox-id", name: "Inbox" }],
    });

    // Should not throw — the full flow (insert + activity) completes
    const result = await addCopies(db as any, "user-1", [{ printingId: "p-1" }]);
    expect(result).toHaveLength(1);
  });
});

describe("moveCopies", () => {
  it("throws NOT_FOUND if target collection does not exist", async () => {
    const { db } = createMockDb({ targetCollection: undefined });

    await expect(moveCopies(db as any, "user-1", ["copy-1"], "bad-col")).rejects.toThrow(
      "Target collection not found",
    );
  });

  it("throws NOT_FOUND if some copies are not found", async () => {
    const { db } = createMockDb({
      targetCollection: { id: "col-2", name: "Target" },
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Source",
        },
      ],
    });

    await expect(
      moveCopies(db as any, "user-1", ["copy-1", "copy-missing"], "col-2"),
    ).rejects.toThrow("One or more copies not found");
  });

  it("moves copies successfully", async () => {
    const { db } = createMockDb({
      targetCollection: { id: "col-2", name: "Target" },
      fetchedCopies: [
        {
          id: "copy-1",
          printingId: "p-1",
          collectionId: "col-1",
          collectionName: "Source",
        },
      ],
    });

    // Should not throw — the full flow (fetch + update + activity) completes
    await moveCopies(db as any, "user-1", ["copy-1"], "col-2");
  });
});

describe("disposeCopies", () => {
  it("throws NOT_FOUND if some copies are not found", async () => {
    const { db } = createMockDb({
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

    await expect(disposeCopies(db as any, "user-1", ["copy-1", "copy-missing"])).rejects.toThrow(
      "One or more copies not found",
    );
  });

  it("completes disposal flow including activity logging", async () => {
    const { db } = createMockDb({
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

    // Should not throw — the full flow (fetch + activity + delete) completes
    await disposeCopies(db as any, "user-1", ["copy-1"]);
  });
});
