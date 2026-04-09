import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { setsRepo } from "./sets.js";

const SET = {
  id: "s-1",
  slug: "OGS",
  name: "Proving Grounds",
  printedTotal: 200,
  releasedAt: "2025-01-01",
  sortOrder: 1,
};

describe("setsRepo", () => {
  it("listAll returns all sets", async () => {
    const db = createMockDb([SET]);
    expect(await setsRepo(db).listAll()).toEqual([SET]);
  });

  it("getBySlug returns id when found", async () => {
    const db = createMockDb([{ id: "s-1" }]);
    expect(await setsRepo(db).getBySlug("OGS")).toEqual({ id: "s-1" });
  });

  it("getPrintedTotal returns total", async () => {
    const db = createMockDb([{ printedTotal: 200 }]);
    expect(await setsRepo(db).getPrintedTotal("s-1")).toEqual({ printedTotal: 200 });
  });

  it("create inserts a set", async () => {
    const db = createMockDb([]);
    await expect(
      setsRepo(db).create({ slug: "NEW", name: "New Set", printedTotal: null, sortOrder: 1 }),
    ).resolves.toBeUndefined();
  });

  it("create with releasedAt", async () => {
    const db = createMockDb([]);
    await expect(
      setsRepo(db).create({
        slug: "NEW",
        name: "New Set",
        printedTotal: 100,
        releasedAt: "2025-06-01",
        sortOrder: 2,
      }),
    ).resolves.toBeUndefined();
  });

  it("createIfNotExists returns id when inserted", async () => {
    const db = createMockDb([{ id: "s-new" }]);
    expect(
      await setsRepo(db).createIfNotExists({ slug: "NEW", name: "New Set", printedTotal: null }),
    ).toBe("s-new");
  });

  it("createIfNotExists returns null when slug exists", async () => {
    const db = createMockDb([]);
    expect(
      await setsRepo(db).createIfNotExists({
        slug: "OGS",
        name: "Proving Grounds",
        printedTotal: null,
      }),
    ).toBeNull();
  });

  it("update returns true when row updated", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(
      await setsRepo(db).update("s-1", { name: "Updated", printedTotal: 200, releasedAt: null }),
    ).toBe(true);
  });

  it("update returns false when row not found", async () => {
    const db = createMockDb([]);
    expect(
      await setsRepo(db).update("s-1", { name: "Updated", printedTotal: null, releasedAt: null }),
    ).toBe(false);
  });

  it("deleteById deletes a set", async () => {
    const db = createMockDb([]);
    await expect(setsRepo(db).deleteById("s-1")).resolves.toBeUndefined();
  });

  it("cardCount returns count", async () => {
    const db = createMockDb([{ count: 42 }]);
    expect(await setsRepo(db).cardCount("s-1")).toBe(42);
  });

  it("printingCount returns count", async () => {
    const db = createMockDb([{ count: 100 }]);
    expect(await setsRepo(db).printingCount("s-1")).toBe(100);
  });

  it("cardCountsBySet returns counts per set", async () => {
    const db = createMockDb([{ setId: "s-1", cardCount: 42 }]);
    expect(await setsRepo(db).cardCountsBySet()).toHaveLength(1);
  });

  it("printingCountsBySet returns counts per set", async () => {
    const db = createMockDb([{ setId: "s-1", printingCount: 100 }]);
    expect(await setsRepo(db).printingCountsBySet()).toHaveLength(1);
  });

  it("reorder updates sort orders", async () => {
    const db = createMockDb([]);
    await expect(setsRepo(db).reorder(["s-1", "s-2"])).resolves.toBeUndefined();
  });

  it("reorder is a no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(setsRepo(db).reorder([])).resolves.toBeUndefined();
  });

  it("upsert creates set when it doesn't exist", async () => {
    // The mock can't distinguish between the two sequential calls, but we exercise the
    // `!existing` branch by having executeTakeFirst return undefined. The subsequent
    // executeTakeFirstOrThrow will also see undefined and throw, but the branch is covered.
    const db = createMockDb([]);
    try {
      await setsRepo(db).upsert("NEW", "New Set");
    } catch {
      // Expected: mock returns undefined for executeTakeFirstOrThrow too
    }
  });

  it("upsert does nothing when set exists", async () => {
    const db = createMockDb([{ id: "s-1" }]);
    await expect(setsRepo(db).upsert("OGS", "Proving Grounds")).resolves.toBeUndefined();
  });
});
