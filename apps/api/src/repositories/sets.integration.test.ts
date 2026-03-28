import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { setsRepo } from "./sets.js";

const ctx = createDbContext("a0000000-0042-4000-a000-000000000001");

describe.skipIf(!ctx)("setsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = setsRepo(db);

  const createdSetIds: string[] = [];

  afterAll(async () => {
    // Delete printings referencing our test sets first
    if (createdSetIds.length > 0) {
      await db.deleteFrom("printings").where("setId", "in", createdSetIds).execute();
      await db.deleteFrom("sets").where("id", "in", createdSetIds).execute();
    }
  });

  it("ping returns true when DB is reachable", async () => {
    const result = await repo.ping();
    expect(result).toBe(true);
  });

  it("hasAny returns true when sets exist", async () => {
    const result = await repo.hasAny();
    expect(result).toBe(true);
  });

  it("listAll returns all sets ordered by sortOrder", async () => {
    const sets = await repo.listAll();
    expect(sets.length).toBeGreaterThan(0);
    expect(sets[0]).toHaveProperty("id");
    expect(sets[0]).toHaveProperty("slug");
    expect(sets[0]).toHaveProperty("name");
    expect(sets[0]).toHaveProperty("sortOrder");
  });

  it("getBySlug returns a set id by slug", async () => {
    const sets = await repo.listAll();
    const first = sets[0];
    const result = await repo.getBySlug(first.slug);
    expect(result).toBeDefined();
    expect(result!.id).toBe(first.id);
  });

  it("getBySlug returns undefined for nonexistent slug", async () => {
    const result = await repo.getBySlug("nonexistent-slug-42");
    expect(result).toBeUndefined();
  });

  it("getPrintedTotal returns printed total by id", async () => {
    const sets = await repo.listAll();
    const result = await repo.getPrintedTotal(sets[0].id);
    expect(result).toBeDefined();
    expect(typeof result!.printedTotal === "number" || result!.printedTotal === null).toBe(true);
  });

  it("getBySlugWithPrintingCount returns set id and printing count", async () => {
    const sets = await repo.listAll();
    const result = await repo.getBySlugWithPrintingCount(sets[0].slug);
    expect(result).toBeDefined();
    expect(result!.id).toBe(sets[0].id);
    expect(typeof result!.printingCount).toBe("number");
  });

  it("getBySlugWithPrintingCount returns undefined for nonexistent slug", async () => {
    const result = await repo.getBySlugWithPrintingCount("nonexistent-slug-42");
    expect(result).toBeUndefined();
  });

  it("nextSortOrder returns a number greater than current max", async () => {
    const next = await repo.nextSortOrder();
    expect(typeof next).toBe("number");
    expect(next).toBeGreaterThan(0);
  });

  it("create inserts a new set", async () => {
    const sortOrder = await repo.nextSortOrder();
    await repo.create({
      slug: "test-set-42",
      name: "Test Set 42",
      printedTotal: 100,
      sortOrder,
    });

    const found = await repo.getBySlug("test-set-42");
    expect(found).toBeDefined();
    createdSetIds.push(found!.id);
  });

  it("createIfNotExists inserts when slug does not exist", async () => {
    const id = await repo.createIfNotExists({
      slug: "test-set-42b",
      name: "Test Set 42b",
      printedTotal: null,
    });
    expect(id).not.toBeNull();
    createdSetIds.push(id!);
  });

  it("createIfNotExists returns null when slug already exists", async () => {
    const id = await repo.createIfNotExists({
      slug: "test-set-42b",
      name: "Different Name",
      printedTotal: 50,
    });
    expect(id).toBeNull();
  });

  it("update modifies a set and returns true", async () => {
    const id = createdSetIds[0];
    const updated = await repo.update(id, {
      name: "Updated Test Set",
      printedTotal: 200,
      releasedAt: "2026-01-01",
    });
    expect(updated).toBe(true);

    const sets = await repo.listAll();
    const found = sets.find((s) => s.id === id);
    expect(found!.name).toBe("Updated Test Set");
  });

  it("update returns false for nonexistent id", async () => {
    const result = await repo.update("00000000-0000-0000-0000-000000000000", {
      name: "Nope",
      printedTotal: null,
      releasedAt: null,
    });
    expect(result).toBe(false);
  });

  it("cardCount returns 0 for a set with no printings", async () => {
    const id = createdSetIds[0];
    const count = await repo.cardCount(id);
    expect(count).toBe(0);
  });

  it("printingCount returns 0 for a set with no printings", async () => {
    const id = createdSetIds[0];
    const count = await repo.printingCount(id);
    expect(count).toBe(0);
  });

  it("cardCountsBySet returns counts per set", async () => {
    const counts = await repo.cardCountsBySet();
    expect(Array.isArray(counts)).toBe(true);
    if (counts.length > 0) {
      expect(counts[0]).toHaveProperty("setId");
      expect(counts[0]).toHaveProperty("cardCount");
    }
  });

  it("printingCountsBySet returns counts per set", async () => {
    const counts = await repo.printingCountsBySet();
    expect(Array.isArray(counts)).toBe(true);
    if (counts.length > 0) {
      expect(counts[0]).toHaveProperty("setId");
      expect(counts[0]).toHaveProperty("printingCount");
    }
  });

  it("reorder updates sort orders for given set ids", async () => {
    const idA = createdSetIds[0];
    const idB = createdSetIds[1];
    await repo.reorder([idB, idA]);

    const sets = await repo.listAll();
    const a = sets.find((s) => s.id === idA);
    const b = sets.find((s) => s.id === idB);
    expect(b!.sortOrder).toBe(1);
    expect(a!.sortOrder).toBe(2);
  });

  it("reorder with empty array is a no-op", async () => {
    await repo.reorder([]);
  });

  it("upsert creates a set if slug does not exist", async () => {
    await repo.upsert("test-upsert-42", "Upserted Set");

    const found = await repo.getBySlug("test-upsert-42");
    expect(found).toBeDefined();
    createdSetIds.push(found!.id);
  });

  it("upsert does nothing if slug already exists", async () => {
    const before = await repo.listAll();
    const beforeCount = before.length;

    await repo.upsert("test-upsert-42", "Different Name");

    const after = await repo.listAll();
    expect(after.length).toBe(beforeCount);
  });

  it("deleteById removes a set", async () => {
    const sortOrder = await repo.nextSortOrder();
    await repo.create({
      slug: "test-delete-42",
      name: "Delete Me",
      printedTotal: null,
      sortOrder,
    });

    const found = await repo.getBySlug("test-delete-42");
    expect(found).toBeDefined();

    await repo.deleteById(found!.id);

    const deleted = await repo.getBySlug("test-delete-42");
    expect(deleted).toBeUndefined();
  });
});
