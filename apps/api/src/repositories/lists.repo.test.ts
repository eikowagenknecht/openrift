import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { listsRepo } from "./lists.js";

const LIST = {
  id: "lst-1",
  userId: "u1",
  name: "Wants",
  intent: "buy" as const,
  kind: "card" as const,
  isPublic: false,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ENTRY = {
  id: "le-1",
  listId: "lst-1",
  userId: "u1",
  kind: "card" as const,
  cardId: "card-1",
  printingId: null,
  copyId: null,
  quantity: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("listsRepo", () => {
  it("listForUser returns lists", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.listForUser("u1")).toEqual([LIST]);
  });

  it("listForUser filters by intent when given", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.listForUser("u1", "buy")).toEqual([LIST]);
  });

  it("getByIdForUser returns a list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.getByIdForUser("lst-1", "u1")).toEqual(LIST);
  });

  it("getIdAndKind returns id + kind when owned", async () => {
    const db = createMockDb([{ id: "lst-1", kind: "card" }]);
    const repo = listsRepo(db);
    expect(await repo.getIdAndKind("lst-1", "u1")).toEqual({ id: "lst-1", kind: "card" });
  });

  it("create returns the created list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    const result = await repo.create({ userId: "u1", name: "Wants", intent: "buy", kind: "card" });
    expect(result).toEqual(LIST);
  });

  it("update returns the updated list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.update("lst-1", "u1", { name: "Renamed" })).toEqual(LIST);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = listsRepo(db);
    const result = await repo.deleteByIdForUser("lst-1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  it("setShareToken sets a token + isPublic=true", async () => {
    const shared = { ...LIST, isPublic: true, shareToken: "tok-abc" };
    const db = createMockDb([shared]);
    const repo = listsRepo(db);
    expect(await repo.setShareToken("lst-1", "u1", "tok-abc", true)).toEqual(shared);
  });

  it("setShareToken nulls the token + isPublic=false on unshare", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.setShareToken("lst-1", "u1", null, false)).toEqual(LIST);
  });

  it("findByShareToken returns list + owner name", async () => {
    const db = createMockDb([{ ...LIST, ownerName: "Friend" }]);
    const repo = listsRepo(db);
    const found = await repo.findByShareToken("tok-abc");
    expect(found?.list.id).toBe("lst-1");
    expect(found?.ownerName).toBe("Friend");
  });

  it("findByShareToken returns undefined when token is unknown", async () => {
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.findByShareToken("nope")).toBeUndefined();
  });

  it("entriesWithDetails dispatches to the card-kind query", async () => {
    const enriched = [
      {
        id: "le-1",
        listId: "lst-1",
        cardId: "card-1",
        quantity: 1,
        cardName: "Fire Dragon",
        cardType: "unit",
      },
    ];
    const db = createMockDb(enriched);
    const repo = listsRepo(db);
    const rows = await repo.entriesWithDetails("lst-1", "card", "u1");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.cardName).toBe("Fire Dragon");
    // The card-kind query produces the card variant — no printing/copy fields.
    expect(row?.kind).toBe("card");
    if (row?.kind === "card") {
      expect(row.cardId).toBe("card-1");
    }
    expect("setId" in (row ?? {})).toBe(false);
    expect("printingId" in (row ?? {})).toBe(false);
  });

  it("entriesWithDetailsAnon skips user-scoping", async () => {
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.entriesWithDetailsAnon("lst-1", "card")).toEqual([]);
  });

  it("createEntry returns the created entry", async () => {
    const db = createMockDb([ENTRY]);
    const repo = listsRepo(db);
    const result = await repo.createEntry({
      listId: "lst-1",
      userId: "u1",
      kind: "card",
      cardId: "card-1",
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    expect(result).toEqual(ENTRY);
  });

  it("bulkCreateEntries returns zero counts for empty input without hitting the db", async () => {
    const db = createMockDb([{ id: "should-not-appear" }]);
    const repo = listsRepo(db);
    expect(await repo.bulkCreateEntries("card", [])).toEqual({ inserted: 0, updated: 0 });
  });

  it("bulkCreateEntries counts inserted vs. updated rows from the xmax marker", async () => {
    // The .returning(xmax = 0) marker distinguishes brand-new rows (true)
    // from rows merged into via ON CONFLICT DO UPDATE (false).
    const db = createMockDb([{ inserted: true }, { inserted: false }, { inserted: true }]);
    const repo = listsRepo(db);
    const result = await repo.bulkCreateEntries("card", [
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-1",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-2",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-3",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ inserted: 2, updated: 1 });
  });

  it("bulkCreateEntriesFromCopies returns zero counts for empty input", async () => {
    const db = createMockDb([{ id: "should-not-appear" }]);
    const repo = listsRepo(db);
    expect(await repo.bulkCreateEntriesFromCopies("lst-1", "card", "u1", [])).toEqual({
      added: 0,
      updated: 0,
      skipped: 0,
    });
  });

  it("bulkCreateEntriesFromCopies skips all when no owned copies are returned", async () => {
    // Returning an empty array from the SELECT means none of the copy IDs
    // belonged to the user; everything is reported as skipped.
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.bulkCreateEntriesFromCopies("lst-1", "card", "u1", ["c1", "c2"])).toEqual({
      added: 0,
      updated: 0,
      skipped: 2,
    });
  });

  it("updateEntry returns the updated entry", async () => {
    const updated = { ...ENTRY, quantity: 5 };
    const db = createMockDb([updated]);
    const repo = listsRepo(db);
    expect(await repo.updateEntry("le-1", "lst-1", "u1", { quantity: 5 })).toEqual(updated);
  });

  it("deleteEntry returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = listsRepo(db);
    expect(await repo.deleteEntry("le-1", "lst-1", "u1")).toEqual({ numDeletedRows: 1n });
  });
});
