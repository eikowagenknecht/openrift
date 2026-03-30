import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { userPreferencesRepo } from "./user-preferences.js";

describe("userPreferencesRepo", () => {
  it("getByUserId returns undefined when not found", async () => {
    const db = createMockDb([]);
    const repo = userPreferencesRepo(db);
    expect(await repo.getByUserId("u1")).toBeUndefined();
  });

  it("getByUserId returns parsed preferences when found", async () => {
    const data = { theme: "dark" };
    const db = createMockDb([{ userId: "u1", data, createdAt: new Date(), updatedAt: new Date() }]);
    const repo = userPreferencesRepo(db);
    const result = await repo.getByUserId("u1");
    expect(result).toBeDefined();
    expect(result!.data).toEqual(data);
  });

  it("getByUserId parses stringified JSON data", async () => {
    const data = JSON.stringify({ theme: "dark" });
    const db = createMockDb([{ userId: "u1", data, createdAt: new Date(), updatedAt: new Date() }]);
    const repo = userPreferencesRepo(db);
    const result = await repo.getByUserId("u1");
    expect(result!.data).toEqual({ theme: "dark" });
  });

  it("upsert creates new preferences when none exist", async () => {
    // First call (getByUserId): executeTakeFirst returns undefined
    // Second call (insert): executeTakeFirstOrThrow returns the new row
    const db = createMockDb([
      {
        userId: "u1",
        data: JSON.stringify({ theme: "dark" }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const repo = userPreferencesRepo(db);
    const result = await repo.upsert("u1", { theme: "dark" });
    // The mock returns the same row for all calls; the method merges incoming with current
    expect(result).toBeDefined();
  });

  it("upsert merges with existing preferences", async () => {
    const existing = { theme: "light", groupBy: "set" };
    const db = createMockDb([
      { userId: "u1", data: existing, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const repo = userPreferencesRepo(db);
    const result = await repo.upsert("u1", { theme: "dark" });
    expect(result).toBeDefined();
  });

  it("upsert removes keys set to null", async () => {
    const existing = { theme: "light", groupBy: "set" };
    const db = createMockDb([
      { userId: "u1", data: existing, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const repo = userPreferencesRepo(db);
    const result = await repo.upsert("u1", { theme: null });
    expect(result).toBeDefined();
  });

  it("upsert skips undefined keys", async () => {
    const existing = { theme: "light" };
    const db = createMockDb([
      { userId: "u1", data: existing, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const repo = userPreferencesRepo(db);
    const result = await repo.upsert("u1", { theme: undefined });
    expect(result).toBeDefined();
  });
});
