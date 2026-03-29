import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { featureFlagsRepo } from "./feature-flags.js";

const ROW = {
  key: "beta",
  enabled: true,
  description: "Beta flag",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("featureFlagsRepo", () => {
  it("listKeyEnabled returns key/enabled pairs", async () => {
    const db = createMockDb([{ key: "beta", enabled: true }]);
    const repo = featureFlagsRepo(db);
    expect(await repo.listKeyEnabled()).toEqual([{ key: "beta", enabled: true }]);
  });

  it("listAll returns all flags", async () => {
    const db = createMockDb([ROW]);
    const repo = featureFlagsRepo(db);
    expect(await repo.listAll()).toEqual([ROW]);
  });

  it("create returns the new flag row", async () => {
    const db = createMockDb([ROW]);
    const repo = featureFlagsRepo(db);
    const result = await repo.create({ key: "beta", enabled: true, description: "Beta flag" });
    expect(result).toEqual(ROW);
  });

  it("update returns the updated flag row", async () => {
    const db = createMockDb([ROW]);
    const repo = featureFlagsRepo(db);
    const result = await repo.update("beta", { enabled: false });
    expect(result).toEqual(ROW);
  });

  it("deleteByKey returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = featureFlagsRepo(db);
    const result = await repo.deleteByKey("beta");
    expect(result).toEqual({ numDeletedRows: 1n });
  });
});
