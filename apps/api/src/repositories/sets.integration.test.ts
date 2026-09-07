import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { setsRepo } from "./sets.js";

const ctx = createDbContext("a0000000-0042-4000-a000-000000000001");

describe.skipIf(!ctx)("setsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = setsRepo(db);

  const createdSetIds: string[] = [];

  afterAll(async () => {
    if (createdSetIds.length > 0) {
      await db.deleteFrom("printings").where("setId", "in", createdSetIds).execute();
      // `set_releases` cascades from `sets`, but delete explicitly so a failed
      // run doesn't leave rows behind for the next one.
      await db.deleteFrom("setReleases").where("setId", "in", createdSetIds).execute();
      await db.deleteFrom("sets").where("id", "in", createdSetIds).execute();
    }
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

  it("create inserts a new set", async () => {
    await repo.create({
      slug: "test-set-42",
      name: "Test Set 42",
      printedTotal: 100,
      sortOrder: 9999,
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
      setType: "supplemental",
    });
    expect(id).not.toBeNull();
    createdSetIds.push(id!);

    // The column defaults to 'main'.
    const sets = await repo.listAll();
    expect(sets.find((s) => s.id === id)!.setType).toBe("supplemental");
  });

  it("createIfNotExists returns null when slug already exists", async () => {
    const id = await repo.createIfNotExists({
      slug: "test-set-42b",
      name: "Different Name",
      printedTotal: 50,
      setType: "main",
    });
    expect(id).toBeNull();
  });

  it("update modifies a set and returns true", async () => {
    const id = createdSetIds[0];
    const updated = await repo.update(id, {
      name: "Updated Test Set",
      printedTotal: 200,
      setType: "main",
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
      setType: "main",
    });
    expect(result).toBe(false);
  });

  it("replaceReleases writes, updates and deletes language rows", async () => {
    const id = createdSetIds[0];

    await repo.replaceReleases(id, {
      EN: { releasedAt: "2026-01-15", precision: "day" },
      FR: { releasedAt: "2026-04-01", precision: "quarter" },
      KR: { releasedAt: null, precision: null },
    });
    let bySet = await repo.releasesBySet();
    let releases = bySet.get(id);
    expect(releases).toEqual({
      EN: { releasedAt: "2026-01-15", precision: "day" },
      FR: { releasedAt: "2026-04-01", precision: "quarter" },
      KR: { releasedAt: null, precision: null },
    });

    await repo.replaceReleases(id, {
      EN: { releasedAt: "2026-01-16", precision: "day" },
      FR: { releasedAt: "2026-04-01", precision: "quarter" },
    });
    bySet = await repo.releasesBySet();
    releases = bySet.get(id);
    expect(releases).toEqual({
      EN: { releasedAt: "2026-01-16", precision: "day" },
      FR: { releasedAt: "2026-04-01", precision: "quarter" },
    });

    await repo.replaceReleases(id, {});
    bySet = await repo.releasesBySet();
    expect(bySet.get(id)).toBeUndefined();
  });

  it("replaceReleases rejects a coarse period that is not its first day", async () => {
    const id = createdSetIds[0];
    await expect(
      repo.replaceReleases(id, { EN: { releasedAt: "2026-05-17", precision: "quarter" } }),
    ).rejects.toThrow(/chk_set_releases_period_start/u);
  });

  it("replaceReleases rejects a date without a precision", async () => {
    const id = createdSetIds[0];
    await expect(
      repo.replaceReleases(id, { EN: { releasedAt: "2026-05-17", precision: null } }),
    ).rejects.toThrow(/chk_set_releases_precision/u);
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
    expect(b!.sortOrder).toBe(0);
    expect(a!.sortOrder).toBe(1);
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

  it("upsert tolerates concurrent inserts of the same new slug", async () => {
    const slug = "test-upsert-race-42";

    await Promise.all(Array.from({ length: 5 }, () => repo.upsert(slug, "Raced Set")));

    const found = await repo.getBySlug(slug);
    expect(found).toBeDefined();
    createdSetIds.push(found!.id);

    const all = await repo.listAll();
    expect(all.filter((s) => s.slug === slug)).toHaveLength(1);
  });

  it("deleteById removes a set", async () => {
    await repo.create({
      slug: "test-delete-42",
      name: "Delete Me",
      printedTotal: null,
      sortOrder: 9998,
    });

    const found = await repo.getBySlug("test-delete-42");
    expect(found).toBeDefined();

    await repo.deleteById(found!.id);

    const deleted = await repo.getBySlug("test-delete-42");
    expect(deleted).toBeUndefined();
  });
});
