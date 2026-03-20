import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { acquisitionSourcesRepo } from "./acquisition-sources.js";

const ctx = createDbContext("a0000000-0029-4000-a000-000000000001");

describe.skipIf(!ctx)("acquisitionSourcesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = acquisitionSourcesRepo(db);

  // Track IDs for cleanup
  const createdSourceIds: string[] = [];

  afterAll(async () => {
    for (const id of createdSourceIds.toReversed()) {
      await db.deleteFrom("acquisitionSources").where("id", "=", id).execute();
    }
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  it("creates a source and returns it with all fields", async () => {
    const source = await repo.create({
      userId,
      name: "Alpha Source",
      description: null,
    });

    createdSourceIds.push(source.id);

    expect(source.id).toBeDefined();
    expect(source.userId).toBe(userId);
    expect(source.name).toBe("Alpha Source");
    expect(source.description).toBeNull();
  });

  it("creates a source with a description", async () => {
    const source = await repo.create({
      userId,
      name: "Beta Source",
      description: "Local card shop",
    });

    createdSourceIds.push(source.id);

    expect(source.name).toBe("Beta Source");
    expect(source.description).toBe("Local card shop");
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists all sources for the user ordered by name", async () => {
    const sources = await repo.listForUser(userId);

    expect(sources.length).toBeGreaterThanOrEqual(2);
    // Verify ordering by name
    for (let i = 1; i < sources.length; i++) {
      expect(sources[i].name >= sources[i - 1].name).toBe(true);
    }
    // All belong to our user
    for (const s of sources) {
      expect(s.userId).toBe(userId);
    }
  });

  it("returns empty array for a different user", async () => {
    const sources = await repo.listForUser("a0000000-9999-4000-a000-000000000001");

    expect(sources).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getByIdForUser
  // ---------------------------------------------------------------------------

  it("returns a source by id for the correct user", async () => {
    const sourceId = createdSourceIds[0];
    const source = await repo.getByIdForUser(sourceId, userId);

    expect(source).toBeDefined();
    expect(source!.id).toBe(sourceId);
    expect(source!.userId).toBe(userId);
    expect(source!.name).toBe("Alpha Source");
  });

  it("returns undefined when source belongs to another user", async () => {
    const sourceId = createdSourceIds[0];
    const source = await repo.getByIdForUser(sourceId, "a0000000-9999-4000-a000-000000000001");

    expect(source).toBeUndefined();
  });

  it("returns undefined for a nonexistent source id", async () => {
    const source = await repo.getByIdForUser("a0000000-0000-4000-a000-000000000000", userId);

    expect(source).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  it("updates a source and returns the updated row", async () => {
    const sourceId = createdSourceIds[0];
    const updated = await repo.update(sourceId, userId, { name: "Renamed Source" });

    expect(updated).toBeDefined();
    expect(updated!.id).toBe(sourceId);
    expect(updated!.name).toBe("Renamed Source");
  });

  it("returns undefined when updating a nonexistent source", async () => {
    const result = await repo.update("a0000000-0000-4000-a000-000000000000", userId, {
      name: "Nope",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when updating a source owned by another user", async () => {
    const sourceId = createdSourceIds[0];
    const result = await repo.update(sourceId, "a0000000-9999-4000-a000-000000000001", {
      name: "Hijack",
    });

    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // deleteByIdForUser
  // ---------------------------------------------------------------------------

  it("deletes a source and returns numDeletedRows = 1", async () => {
    // Create a throwaway source to delete
    const source = await repo.create({
      userId,
      name: "To Delete",
      description: null,
    });

    const result = await repo.deleteByIdForUser(source.id, userId);

    expect(result.numDeletedRows).toBe(1n);

    // Verify it's gone
    const gone = await repo.getByIdForUser(source.id, userId);
    expect(gone).toBeUndefined();
  });

  it("returns numDeletedRows = 0 for a nonexistent source", async () => {
    const result = await repo.deleteByIdForUser("a0000000-0000-4000-a000-000000000000", userId);

    expect(result.numDeletedRows).toBe(0n);
  });

  it("returns numDeletedRows = 0 when trying to delete another user's source", async () => {
    const sourceId = createdSourceIds[0];
    const result = await repo.deleteByIdForUser(sourceId, "a0000000-9999-4000-a000-000000000001");

    expect(result.numDeletedRows).toBe(0n);
  });
});
