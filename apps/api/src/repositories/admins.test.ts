import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { adminsRepo } from "./admins.js";

describe("adminsRepo", () => {
  it("isAdmin returns true when user row exists", async () => {
    const db = createMockDb([{ userId: "u1" }]);
    const repo = adminsRepo(db);
    expect(await repo.isAdmin("u1")).toBe(true);
  });

  it("isAdmin returns false when user row not found", async () => {
    const db = createMockDb([]);
    const repo = adminsRepo(db);
    expect(await repo.isAdmin("u1")).toBe(false);
  });

  it("autoPromote inserts without throwing", async () => {
    const db = createMockDb([]);
    const repo = adminsRepo(db);
    await expect(repo.autoPromote("u1")).resolves.toBeUndefined();
  });
});
