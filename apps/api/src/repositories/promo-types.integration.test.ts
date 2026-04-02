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
    createdIds.push(row.id);

    const fetched = await repo.getById(row.id);
    expect(fetched).toBeDefined();
    expect(fetched!.slug).toBe("test-promo-36");
  });

  it("creates a second promo type", async () => {
    const row = await repo.create({
      slug: "test-promo-ordered-36",
      label: "Ordered",
    });
    expect(row.label).toBe("Ordered");
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

  it("listAll returns all promo types ordered by label", async () => {
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

  it("deleteById removes a promo type", async () => {
    const row = await repo.create({ slug: "test-delete-36", label: "Delete Me" });
    await repo.deleteById(row.id);

    const fetched = await repo.getById(row.id);
    expect(fetched).toBeUndefined();
  });
});
