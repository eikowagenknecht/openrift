import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { featureFlagsRepo } from "./feature-flags.js";

const ctx = createDbContext("a0000000-0031-4000-a000-000000000001");

describe.skipIf(!ctx)("featureFlagsRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = featureFlagsRepo(db);

  const createdKeys: string[] = [];

  afterAll(async () => {
    for (const key of createdKeys) {
      await repo.deleteByKey(key);
    }
  });

  it("creates a flag with description", async () => {
    const flag = await repo.create({
      key: "test-flag-0031-a",
      enabled: true,
      description: "Integration test flag A",
    });

    expect(flag).toBeDefined();
    createdKeys.push(flag!.key);

    expect(flag!.key).toBe("test-flag-0031-a");
    expect(flag!.enabled).toBe(true);
    expect(flag!.description).toBe("Integration test flag A");
  });

  it("creates a flag with null description", async () => {
    const flag = await repo.create({
      key: "test-flag-0031-b",
      enabled: false,
      description: null,
    });

    expect(flag).toBeDefined();
    createdKeys.push(flag!.key);

    expect(flag!.key).toBe("test-flag-0031-b");
    expect(flag!.enabled).toBe(false);
    expect(flag!.description).toBeNull();
  });

  it("returns undefined for a duplicate key", async () => {
    const result = await repo.create({
      key: "test-flag-0031-a",
      enabled: false,
      description: null,
    });

    expect(result).toBeUndefined();
  });

  it("lists all flags ordered by key", async () => {
    const flags = await repo.listAll();

    expect(flags.length).toBeGreaterThanOrEqual(2);

    const keys = flags.map((f) => f.key);
    expect(keys).toContain("test-flag-0031-a");
    expect(keys).toContain("test-flag-0031-b");

    for (let i = 1; i < flags.length; i++) {
      expect(flags[i].key >= flags[i - 1].key).toBe(true);
    }
  });

  it("lists only key and enabled fields", async () => {
    const flags = await repo.listKeyEnabled();

    expect(flags.length).toBeGreaterThanOrEqual(2);

    const flagA = flags.find((f) => f.key === "test-flag-0031-a");
    expect(flagA).toBeDefined();
    expect(flagA!.enabled).toBe(true);
    expect(Object.keys(flagA!).sort()).toEqual(["enabled", "key"]);
  });

  it("updates a flag and returns the updated row", async () => {
    const updated = await repo.update("test-flag-0031-a", {
      enabled: false,
      description: "Updated description",
    });

    expect(updated).toBeDefined();
    expect(updated!.key).toBe("test-flag-0031-a");
    expect(updated!.enabled).toBe(false);
    expect(updated!.description).toBe("Updated description");
  });

  it("returns undefined when updating a nonexistent flag", async () => {
    const result = await repo.update("nonexistent-flag-0031", { enabled: true });

    expect(result).toBeUndefined();
  });

  it("deletes a flag and returns numDeletedRows = 1", async () => {
    await repo.create({
      key: "test-flag-0031-delete",
      enabled: false,
      description: null,
    });

    const result = await repo.deleteByKey("test-flag-0031-delete");

    expect(result.numDeletedRows).toBe(1n);
  });

  it("returns numDeletedRows = 0 when deleting a nonexistent flag", async () => {
    const result = await repo.deleteByKey("nonexistent-flag-0031");

    expect(result.numDeletedRows).toBe(0n);
  });
});
