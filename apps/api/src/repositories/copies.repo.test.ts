import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { createMockDb } from "../test/mock-db.js";
import { copiesRepo } from "./copies.js";

const COPY_ROW = {
  id: "cp-1",
  printingId: "p-1",
  collectionId: "col-1",
  groupId: null,
  createdAt: new Date(),
};

describe("copiesRepo", () => {
  it("listForAccessibleCollections returns copies without cursor", async () => {
    const db = createMockDb([COPY_ROW]);
    const repo = copiesRepo(db);
    expect(await repo.listForAccessibleCollections("u1", 20)).toEqual([COPY_ROW]);
  });

  it("listForAccessibleCollections applies cursor filter", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    expect(
      await repo.listForAccessibleCollections("u1", 20, "2026-01-01T00:00:00.000Z_cp-last"),
    ).toEqual([]);
  });

  // Regression: the cursor parser used to pass an unparseable cursor straight
  // into `new Date(...)` and let the resulting Invalid Date reach the Kysely
  // query, producing an INTERNAL_ERROR 500. The query schema now rejects
  // malformed cursors before they get this far, but keysetCursorPredicate also
  // guards, so any unvalidated caller fails with a 400 AppError instead.
  it("listForAccessibleCollections rejects an unparseable cursor", () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    expect(() => repo.listForAccessibleCollections("u1", 20, "not-a-date")).toThrow(AppError);
    try {
      repo.listForAccessibleCollections("u1", 20, "not-a-date");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
    }
  });

  it("existsForViewer returns id when found", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    const repo = copiesRepo(db);
    expect(await repo.existsForViewer("cp-1", "u1")).toEqual({ id: "cp-1" });
  });

  it("filterAccessibleByViewer returns matching ids", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    const repo = copiesRepo(db);
    expect(await repo.filterAccessibleByViewer(["cp-1"], "u1")).toEqual(["cp-1"]);
  });

  it("listForCollection returns copies without cursor", async () => {
    const db = createMockDb([COPY_ROW]);
    const repo = copiesRepo(db);
    expect(await repo.listForCollection("col-1", 20)).toEqual([COPY_ROW]);
  });

  it("listForCollection applies cursor filter", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    expect(await repo.listForCollection("col-1", 20, "2026-01-01T00:00:00.000Z_cp-last")).toEqual(
      [],
    );
  });

  it("insertBatch returns inserted copies", async () => {
    const db = createMockDb([{ id: "cp-1", printingId: "p-1", collectionId: "col-1" }]);
    const repo = copiesRepo(db);
    const result = await repo.insertBatch([{ printingId: "p-1", collectionId: "col-1" }]);
    expect(result).toHaveLength(1);
  });

  it("listWithCollectionContext returns copies with collection name", async () => {
    const db = createMockDb([
      {
        id: "cp-1",
        printingId: "p-1",
        collectionId: "col-1",
        collectionName: "Main",
      },
    ]);
    const repo = copiesRepo(db);
    expect(await repo.listWithCollectionContext(["cp-1"])).toHaveLength(1);
  });

  it("moveBatchById moves copies", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    await expect(repo.moveBatchById(["cp-1"], "col-2")).resolves.toBeUndefined();
  });

  it("deleteBatchById deletes copies", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    await expect(repo.deleteBatchById(["cp-1"])).resolves.toBeUndefined();
  });

  it("countByCardAndPrintingForDeckbuilding returns counts", async () => {
    const db = createMockDb([{ cardId: "c-1", printingId: "p-1", count: 2 }]);
    const repo = copiesRepo(db);
    expect(await repo.countByCardAndPrintingForDeckbuilding("u1")).toEqual([
      { cardId: "c-1", printingId: "p-1", count: 2 },
    ]);
  });

  it("ownedRowsForUser returns the owner's copies", async () => {
    const rows = [
      { copyId: "cp-1", printingId: "p-1", cardId: "c-1", collectionId: "col-1", reserved: false },
    ];
    const db = createMockDb(rows);
    expect(await copiesRepo(db).ownedRowsForUser("u1")).toEqual(rows);
  });

  it("ownedRowsForUser narrows to the given printings", async () => {
    const rows = [
      { copyId: "cp-1", printingId: "p-1", cardId: "c-1", collectionId: "col-1", reserved: false },
    ];
    const db = createMockDb(rows);
    expect(await copiesRepo(db).ownedRowsForUser("u1", ["p-1"])).toEqual(rows);
  });

  it("ownedRowsForUser short-circuits on an empty printing scope without querying", async () => {
    // A rule set that can consult no printing needs no copies at all: the mock
    // would return a row if the query ran, so an empty result proves it did not.
    const db = createMockDb([{ copyId: "cp-1" }]);
    expect(await copiesRepo(db).ownedRowsForUser("u1", [])).toEqual([]);
  });
});
