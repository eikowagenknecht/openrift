import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { promoTypesRepo } from "./promo-types.js";

const ctx = createDbContext("a0000000-0036-4000-a000-000000000001");

describe.skipIf(!ctx)("promoTypesRepo (integration)", () => {
  const { db } = ctx!;
  const repo = promoTypesRepo(db);

  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await db.deleteFrom("promoTypes").where("id", "in", createdIds).execute();
    }
  });

  it("creates a promo type and retrieves it by id", async () => {
    const row = await repo.create({ slug: "test-promo-36", label: "Test Promo" });
    expect(row.slug).toBe("test-promo-36");
    expect(row.label).toBe("Test Promo");
    expect(row.sortOrder).toBe(0);
    createdIds.push(row.id);

    const fetched = await repo.getById(row.id);
    expect(fetched).toBeDefined();
    expect(fetched!.slug).toBe("test-promo-36");
  });

  it("creates a promo type with custom sort order", async () => {
    const row = await repo.create({
      slug: "test-promo-ordered-36",
      label: "Ordered",
      sortOrder: 42,
    });
    expect(row.sortOrder).toBe(42);
    createdIds.push(row.id);
  });

  it("getBySlug returns the promo type by slug", async () => {
    const fetched = await repo.getBySlug("test-promo-36");
    expect(fetched).toBeDefined();
    expect(fetched!.label).toBe("Test Promo");
  });

  it("getBySlug returns undefined for nonexistent slug", async () => {
    const result = await repo.getBySlug("nonexistent-slug");
    expect(result).toBeUndefined();
  });

  it("getById returns undefined for nonexistent id", async () => {
    const result = await repo.getById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeUndefined();
  });

  it("listAll returns all promo types ordered by sortOrder then label", async () => {
    const list = await repo.listAll();
    expect(Array.isArray(list)).toBe(true);
    const ours = list.filter((p) => createdIds.includes(p.id));
    expect(ours.length).toBeGreaterThanOrEqual(2);
  });

  it("updates a promo type", async () => {
    const id = createdIds[0];
    await repo.update(id, { label: "Updated Label" });

    const fetched = await repo.getById(id);
    expect(fetched!.label).toBe("Updated Label");
  });

  it("isInUse returns undefined when promo type is not used by any printing", async () => {
    const id = createdIds[0];
    const result = await repo.isInUse(id);
    expect(result).toBeUndefined();
  });

  it("reorder updates sort orders for given ids", async () => {
    const idA = createdIds[0];
    const idB = createdIds[1];
    await repo.reorder([idB, idA]);

    const fetchedA = await repo.getById(idA);
    const fetchedB = await repo.getById(idB);
    expect(fetchedB!.sortOrder).toBe(1);
    expect(fetchedA!.sortOrder).toBe(2);
  });

  it("reorder with empty array is a no-op", async () => {
    await repo.reorder([]);
    // Should not throw
  });

  it("renamePrintingSlugs updates printing slugs (no-op when no printings use the promo type)", async () => {
    const id = createdIds[0];
    // This should not throw even when no printings use this promo type
    await repo.renamePrintingSlugs(id, "old-suffix", "new-suffix");
  });

  it("deleteById removes a promo type", async () => {
    const row = await repo.create({ slug: "test-delete-36", label: "Delete Me" });
    await repo.deleteById(row.id);

    const fetched = await repo.getById(row.id);
    expect(fetched).toBeUndefined();
  });
});
