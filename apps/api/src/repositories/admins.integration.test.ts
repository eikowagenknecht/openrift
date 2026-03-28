import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { adminsRepo } from "./admins.js";

const ctx = createDbContext("a0000000-0038-4000-a000-000000000001");

describe.skipIf(!ctx)("adminsRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = adminsRepo(db);

  afterAll(async () => {
    await db.deleteFrom("admins").where("userId", "=", userId).execute();
  });

  it("isAdmin returns false for non-admin user", async () => {
    const result = await repo.isAdmin(userId);
    expect(result).toBe(false);
  });

  it("autoPromote promotes a user to admin", async () => {
    await repo.autoPromote(userId);
    const result = await repo.isAdmin(userId);
    expect(result).toBe(true);
  });

  it("autoPromote is a no-op for already-admin user", async () => {
    // Should not throw
    await repo.autoPromote(userId);
    const result = await repo.isAdmin(userId);
    expect(result).toBe(true);
  });
});
