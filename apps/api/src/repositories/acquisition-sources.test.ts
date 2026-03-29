import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { acquisitionSourcesRepo } from "./acquisition-sources.js";

const ROW = { id: "s1", userId: "u1", name: "LGS", description: "Local shop" };

describe("acquisitionSourcesRepo", () => {
  it("listForUser returns sources for user", async () => {
    const db = createMockDb([ROW]);
    const repo = acquisitionSourcesRepo(db);
    expect(await repo.listForUser("u1")).toEqual([ROW]);
  });

  it("getByIdForUser returns a source when found", async () => {
    const db = createMockDb([ROW]);
    const repo = acquisitionSourcesRepo(db);
    expect(await repo.getByIdForUser("s1", "u1")).toEqual(ROW);
  });

  it("getByIdForUser returns undefined when not found", async () => {
    const db = createMockDb([]);
    const repo = acquisitionSourcesRepo(db);
    expect(await repo.getByIdForUser("s1", "u1")).toBeUndefined();
  });

  it("create returns the newly created row", async () => {
    const db = createMockDb([ROW]);
    const repo = acquisitionSourcesRepo(db);
    const result = await repo.create({ userId: "u1", name: "LGS", description: "Local shop" });
    expect(result).toEqual(ROW);
  });

  it("update returns the updated row", async () => {
    const db = createMockDb([ROW]);
    const repo = acquisitionSourcesRepo(db);
    expect(await repo.update("s1", "u1", { name: "Updated" })).toEqual(ROW);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = acquisitionSourcesRepo(db);
    const result = await repo.deleteByIdForUser("s1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });
});
