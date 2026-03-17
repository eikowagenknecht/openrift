/* oxlint-disable
   no-empty-function
   -- test file: mocks require empty fns */
import { describe, expect, it } from "vitest";

import { ensureInbox } from "./inbox.js";

// ---------------------------------------------------------------------------
// Mock DB builder
// ---------------------------------------------------------------------------

function createMockDb(options: { existingId?: string; insertFails?: boolean; refetchId?: string }) {
  let selectCallCount = 0;

  const selectChain: any = {};
  selectChain.select = () => selectChain;
  selectChain.where = () => selectChain;
  selectChain.executeTakeFirst = () => {
    selectCallCount++;
    if (selectCallCount === 1) {
      return Promise.resolve(options.existingId ? { id: options.existingId } : undefined);
    }
    // Second call (re-fetch after insert)
    return Promise.resolve(options.refetchId ? { id: options.refetchId } : undefined);
  };

  const insertChain: any = {};
  insertChain.values = () => insertChain;
  insertChain.onConflict = () => insertChain;
  insertChain.doNothing = () => insertChain;
  insertChain.execute = () => {
    if (options.insertFails) {
      return Promise.resolve([]);
    }
    return Promise.resolve([{ id: "new-inbox" }]);
  };

  const db: any = {
    selectFrom: () => selectChain,
    insertInto: () => insertChain,
  };

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ensureInbox", () => {
  it("returns existing inbox if found", async () => {
    const db = createMockDb({ existingId: "inbox-existing" });
    const id = await ensureInbox(db, "user-1");
    expect(id).toBe("inbox-existing");
  });

  it("creates inbox if not found and returns new id", async () => {
    const db = createMockDb({ refetchId: "inbox-new" });
    const id = await ensureInbox(db, "user-1");
    expect(id).toBe("inbox-new");
  });

  it("handles race condition: insert conflict then refetch succeeds", async () => {
    const db = createMockDb({ insertFails: true, refetchId: "inbox-race" });
    const id = await ensureInbox(db, "user-1");
    expect(id).toBe("inbox-race");
  });

  it("throws if inbox not found even after insert", async () => {
    const db = createMockDb({});
    await expect(ensureInbox(db, "user-1")).rejects.toThrow(
      "Inbox collection not found after insert",
    );
  });
});
