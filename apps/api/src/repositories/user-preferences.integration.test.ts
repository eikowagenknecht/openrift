import { afterAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { userPreferencesRepo } from "./user-preferences.js";

const ctx = createDbContext("a0000000-0037-4000-a000-000000000001");

describe.skipIf(!ctx)("userPreferencesRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
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
    const result = await repo.upsert(userId, { showImages: false });
    expect(result.showImages).toBe(false);
    // Only explicitly-set fields are stored; missing fields resolve to defaults client-side
    expect(Object.keys(result)).toEqual(["showImages"]);
  });

  it("getByUserId returns saved preferences after upsert", async () => {
    const row = await repo.getByUserId(userId);
    expect(row).toBeDefined();
    // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
    expect(row!.userId).toBe(userId);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
    const data = row!.data;
    expect(data.showImages).toBe(false);
    // theme is not stored (using default), so it should be absent
    expect(data.theme).toBeUndefined();
  });

  it("upsert on an existing row merges instead of replacing", async () => {
    const result = await repo.upsert(userId, { theme: "dark" });
    expect(result.theme).toBe("dark");
    expect(result.showImages).toBe(false);
  });

  it("upsert replaces a whole top-level key rather than deep-merging it", async () => {
    await repo.upsert(userId, { emailNotifications: { tradeMatches: true, tradeStatus: false } });
    const replaced = await repo.upsert(userId, { emailNotifications: { tradeMatches: false } });
    expect(replaced.emailNotifications).toEqual({ tradeMatches: false });
  });

  it("upsert removes a key sent as null and leaves the rest alone", async () => {
    const result = await repo.upsert(userId, { emailNotifications: null });
    expect(result.emailNotifications).toBeUndefined();
    expect(result.theme).toBe("dark");
    expect(result.showImages).toBe(false);
  });

  // Regression: the merge used to happen in JS between a read and a write, so
  // concurrent PATCHes each wrote the snapshot they had read and the last one
  // in dropped every key the others had added. Merging in SQL leaves no window.
  it("keeps every key when concurrent patches overlap", async () => {
    // A real user row: user_preferences.user_id is FK-enforced (migration 245).
    const concurrentUserId = crypto.randomUUID();
    await seedTestUser(db, { id: concurrentUserId });
    await repo.upsert(concurrentUserId, { showImages: true });

    await Promise.all([
      repo.upsert(concurrentUserId, { theme: "dark" }),
      repo.upsert(concurrentUserId, { palette: "minimal" }),
      repo.upsert(concurrentUserId, { defaultCardView: "printings" }),
      repo.upsert(concurrentUserId, { defaultCurrency: "USD" }),
    ]);

    const row = await repo.getByUserId(concurrentUserId);
    expect(row?.data).toEqual({
      showImages: true,
      theme: "dark",
      palette: "minimal",
      defaultCardView: "printings",
      defaultCurrency: "USD",
    });

    // The prefs row cascades away with the user.
    await db.deleteFrom("users").where("id", "=", concurrentUserId).execute();
  });
});
