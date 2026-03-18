/* oxlint-disable
   no-empty-function
   -- test file: mocks require empty fns */
import { describe, expect, it } from "vitest";

import { ensureInbox } from "./inbox.js";

// ---------------------------------------------------------------------------
// Mock DB builder
// ---------------------------------------------------------------------------

function createMockDb(options: {
  insertReturnsId?: string;
  selectId?: string;
  selectThrows?: boolean;
}) {
  const selectChain: any = {};
  selectChain.select = () => selectChain;
  selectChain.where = () => selectChain;
  selectChain.executeTakeFirstOrThrow = () => {
    if (options.selectThrows) {
      return Promise.reject(new Error("no result"));
    }
    return Promise.resolve({ id: options.selectId ?? "fallback" });
  };

  const insertChain: any = {};
  insertChain.values = () => insertChain;
  insertChain.onConflict = () => insertChain;
  insertChain.doNothing = () => insertChain;
  insertChain.returning = () => insertChain;
  insertChain.executeTakeFirst = () =>
    Promise.resolve(options.insertReturnsId ? { id: options.insertReturnsId } : undefined);

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
  it("returns id from insert when inbox is newly created", async () => {
    const db = createMockDb({ insertReturnsId: "inbox-new" });
    const id = await ensureInbox(db, "user-1");
    expect(id).toBe("inbox-new");
  });

  it("falls back to select when insert is a no-op (inbox already exists)", async () => {
    const db = createMockDb({ selectId: "inbox-existing" });
    const id = await ensureInbox(db, "user-1");
    expect(id).toBe("inbox-existing");
  });

  it("throws if insert is a no-op and select finds nothing", async () => {
    const db = createMockDb({ selectThrows: true });
    await expect(ensureInbox(db, "user-1")).rejects.toThrow("no result");
  });
});
