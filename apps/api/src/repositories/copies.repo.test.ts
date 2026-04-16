import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { buildCopiesCursor, copiesRepo } from "./copies.js";

const COPY_ROW = {
  id: "cp-1",
  printingId: "p-1",
  collectionId: "col-1",
  createdAt: new Date(),
};

describe("buildCopiesCursor", () => {
  it("encodes createdAt and id into a single string", () => {
    const cursor = buildCopiesCursor(new Date("2026-01-15T12:30:00.000Z"), "abc-123");
    expect(cursor).toBe("2026-01-15T12:30:00.000Z_abc-123");
  });
});

describe("copiesRepo", () => {
  it("listForUser returns copies without cursor", async () => {
    const db = createMockDb([COPY_ROW]);
    const repo = copiesRepo(db);
    expect(await repo.listForUser("u1", 20)).toEqual([COPY_ROW]);
  });

  it("listForUser applies cursor filter", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    expect(await repo.listForUser("u1", 20, "2026-01-01T00:00:00.000Z_cp-last")).toEqual([]);
  });

  it("getByIdForUser returns a copy", async () => {
    const db = createMockDb([COPY_ROW]);
    const repo = copiesRepo(db);
    expect(await repo.getByIdForUser("cp-1", "u1")).toEqual(COPY_ROW);
  });

  it("existsForUser returns id when found", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    const repo = copiesRepo(db);
    expect(await repo.existsForUser("cp-1", "u1")).toEqual({ id: "cp-1" });
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
    const result = await repo.insertBatch([
      { userId: "u1", printingId: "p-1", collectionId: "col-1" } as any,
    ]);
    expect(result).toHaveLength(1);
  });

  it("listWithCollectionName returns copies with collection name", async () => {
    const db = createMockDb([
      {
        id: "cp-1",
        printingId: "p-1",
        collectionId: "col-1",

        collectionName: "Main",
      },
    ]);
    const repo = copiesRepo(db);
    expect(await repo.listWithCollectionName(["cp-1"], "u1")).toHaveLength(1);
  });

  it("moveBatch moves copies", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    await expect(repo.moveBatch(["cp-1"], "u1", "col-2")).resolves.toBeUndefined();
  });

  it("deleteBatch deletes copies", async () => {
    const db = createMockDb([]);
    const repo = copiesRepo(db);
    await expect(repo.deleteBatch(["cp-1"], "u1")).resolves.toBeUndefined();
  });

  it("countByCardAndPrintingForDeckbuilding returns counts", async () => {
    const db = createMockDb([{ cardId: "c-1", printingId: "p-1", count: 2 }]);
    const repo = copiesRepo(db);
    expect(await repo.countByCardAndPrintingForDeckbuilding("u1")).toEqual([
      { cardId: "c-1", printingId: "p-1", count: 2 },
    ]);
  });
});
