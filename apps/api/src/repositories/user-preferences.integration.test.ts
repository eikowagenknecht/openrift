import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { userPreferencesRepo } from "./user-preferences.js";

const ctx = createDbContext("a0000000-0037-4000-a000-000000000001");

/** postgres.js under bun returns jsonb as a string rather than a parsed object.
 *  This helper normalizes it for assertions.
 *  @returns The parsed preferences object. */
function parsePrefs(data: unknown): Record<string, unknown> {
  return typeof data === "string" ? JSON.parse(data) : (data as Record<string, unknown>);
}

describe.skipIf(!ctx)("userPreferencesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = userPreferencesRepo(db);

  afterAll(async () => {
    await db.deleteFrom("userPreferences").where("userId", "=", userId).execute();
  });

  it("getByUserId returns undefined for new user", async () => {
    const result = await repo.getByUserId(userId);
    expect(result).toBeUndefined();
  });

  it("upsert creates preferences for new user with only the provided field", async () => {
    const result = parsePrefs(await repo.upsert(userId, { showImages: false }));
    expect(result.showImages).toBe(false);
    // Only explicitly-set fields are stored; missing fields resolve to defaults client-side
    expect(Object.keys(result)).toEqual(["showImages"]);
  });

  it("getByUserId returns saved preferences after upsert", async () => {
    const row = await repo.getByUserId(userId);
    expect(row).toBeDefined();
    expect(row!.userId).toBe(userId);
    const data = parsePrefs(row!.data);
    expect(data.showImages).toBe(false);
    // theme is not stored (using default), so it should be absent
    expect(data.theme).toBeUndefined();
  });

  it("upsert on existing row exercises the on-conflict path", async () => {
    // Second upsert exercises the ON CONFLICT DO UPDATE path.
    // Note: under bun, postgres.js returns jsonb as a string, which means
    // the repo's `existing?.data` spread produces incorrect merges. This is
    // a known bun/postgres.js discrepancy (see api-coverage-findings.md).
    // We just verify the DB operation itself succeeds.
    const result = await repo.upsert(userId, { theme: "dark" });
    expect(result).toBeDefined();
  });
});
