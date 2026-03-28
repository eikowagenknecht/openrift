import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { siteSettingsRepo } from "./site-settings.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("siteSettingsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = siteSettingsRepo(db);

  const createdKeys: string[] = [];

  afterAll(async () => {
    for (const key of createdKeys) {
      await db.deleteFrom("siteSettings").where("key", "=", key).execute();
    }
  });

  it("creates a setting and retrieves it by scope", async () => {
    const row = await repo.create({ key: "test_setting_34", value: "hello", scope: "web" });
    expect(row).toBeDefined();
    expect(row!.key).toBe("test_setting_34");
    expect(row!.value).toBe("hello");
    expect(row!.scope).toBe("web");
    createdKeys.push("test_setting_34");

    const list = await repo.listByScope("web");
    const found = list.find((s) => s.key === "test_setting_34");
    expect(found).toBeDefined();
    expect(found!.value).toBe("hello");
  });

  it("create returns undefined on duplicate key", async () => {
    const row = await repo.create({ key: "test_dup_34", value: "first", scope: "web" });
    expect(row).toBeDefined();
    createdKeys.push("test_dup_34");

    const dup = await repo.create({ key: "test_dup_34", value: "second", scope: "api" });
    expect(dup).toBeUndefined();
  });

  it("listAll returns all settings ordered by key", async () => {
    const list = await repo.listAll();
    expect(Array.isArray(list)).toBe(true);
    const keys = list.map((s) => s.key);
    expect(keys).toEqual([...keys].sort());
  });

  it("updates a setting value", async () => {
    await repo.create({ key: "test_update_34", value: "old", scope: "web" });
    createdKeys.push("test_update_34");

    const updated = await repo.update("test_update_34", { value: "new" });
    expect(updated).toBeDefined();
    expect(updated!.value).toBe("new");
    expect(updated!.scope).toBe("web");
  });

  it("updates a setting scope", async () => {
    const updated = await repo.update("test_update_34", { scope: "api" });
    expect(updated).toBeDefined();
    expect(updated!.scope).toBe("api");
  });

  it("update returns undefined for nonexistent key", async () => {
    const result = await repo.update("nonexistent_key_34", { value: "x" });
    expect(result).toBeUndefined();
  });

  it("deletes a setting by key", async () => {
    await repo.create({ key: "test_delete_34", value: "bye", scope: "web" });
    // Don't track — we're deleting it

    const result = await repo.deleteByKey("test_delete_34");
    expect(result.numDeletedRows).toBe(1n);
  });

  it("deleteByKey returns 0 for nonexistent key", async () => {
    const result = await repo.deleteByKey("nonexistent_key_34");
    expect(result.numDeletedRows).toBe(0n);
  });

  it("listByScope filters by scope", async () => {
    await repo.create({ key: "test_scope_api_34", value: "api-val", scope: "api" });
    createdKeys.push("test_scope_api_34");

    const apiList = await repo.listByScope("api");
    const found = apiList.find((s) => s.key === "test_scope_api_34");
    expect(found).toBeDefined();

    const webList = await repo.listByScope("web");
    const notFound = webList.find((s) => s.key === "test_scope_api_34");
    expect(notFound).toBeUndefined();
  });
});
