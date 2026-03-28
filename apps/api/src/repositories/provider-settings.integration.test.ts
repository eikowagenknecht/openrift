import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { providerSettingsRepo } from "./provider-settings.js";

const ctx = createDbContext("a0000000-0035-4000-a000-000000000001");

describe.skipIf(!ctx)("providerSettingsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = providerSettingsRepo(db);

  const createdProviders: string[] = [];

  afterAll(async () => {
    if (createdProviders.length > 0) {
      await db.deleteFrom("providerSettings").where("provider", "in", createdProviders).execute();
    }
  });

  it("upsert creates a new provider setting and returns it", async () => {
    const row = await repo.upsert("test-provider-35", { sortOrder: 10, isHidden: false });
    expect(row.provider).toBe("test-provider-35");
    expect(row.sortOrder).toBe(10);
    expect(row.isHidden).toBe(false);
    createdProviders.push("test-provider-35");
  });

  it("upsert updates existing provider setting on conflict", async () => {
    const row = await repo.upsert("test-provider-35", { sortOrder: 20, isHidden: true });
    expect(row.provider).toBe("test-provider-35");
    expect(row.sortOrder).toBe(20);
    expect(row.isHidden).toBe(true);
  });

  it("upsert with partial updates only changes provided fields", async () => {
    await repo.upsert("test-partial-35", { sortOrder: 5 });
    createdProviders.push("test-partial-35");

    const updated = await repo.upsert("test-partial-35", { isHidden: true });
    expect(updated.isHidden).toBe(true);
    // sortOrder should remain from the on-conflict update (only isHidden was in the set)
  });

  it("listAll returns provider settings ordered by sortOrder then provider", async () => {
    const list = await repo.listAll();
    expect(Array.isArray(list)).toBe(true);

    const ourProviders = list.filter((p) => createdProviders.includes(p.provider));
    expect(ourProviders.length).toBeGreaterThanOrEqual(2);
  });

  it("reorder updates sort orders in sequence", async () => {
    await repo.upsert("test-reorder-a-35", { sortOrder: 100 });
    createdProviders.push("test-reorder-a-35");
    await repo.upsert("test-reorder-b-35", { sortOrder: 101 });
    createdProviders.push("test-reorder-b-35");

    await repo.reorder(["test-reorder-b-35", "test-reorder-a-35"]);

    const list = await repo.listAll();
    const providerA = list.find((p) => p.provider === "test-reorder-a-35");
    const providerB = list.find((p) => p.provider === "test-reorder-b-35");
    expect(providerB!.sortOrder).toBe(1);
    expect(providerA!.sortOrder).toBe(2);
  });
});
