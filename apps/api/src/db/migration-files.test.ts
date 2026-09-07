// oxlint-disable-next-line import/no-nodejs-modules -- compares the loader against the directory listing
import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadMigrations } from "./migration-files.js";
import { FOLDED_MIGRATIONS } from "./migrations/_folded.js";

async function migrationFileNames(): Promise<string[]> {
  const names: string[] = await readdir(new URL("migrations/", import.meta.url));
  return names.filter((name) => /^\d{3}-.+\.ts$/u.test(name) && !name.includes(".test."));
}

describe("loadMigrations", () => {
  it("registers every numbered migration file plus the folded names", async () => {
    const files = await migrationFileNames();
    const migrations = await loadMigrations();

    expect(Object.keys(migrations)).toHaveLength(files.length + FOLDED_MIGRATIONS.length);
    for (const name of files) {
      expect(migrations[name.replace(/\.ts$/u, "")]).toBeDefined();
    }
  });

  it("exposes up and down on every entry", async () => {
    const migrations = await loadMigrations();
    for (const [name, migration] of Object.entries(migrations)) {
      expect(typeof migration.up, name).toBe("function");
      expect(typeof migration.down, name).toBe("function");
    }
  });

  it("sorts 001-core-schema first", async () => {
    const names = Object.keys(await loadMigrations()).toSorted();
    expect(names[0]).toBe("001-core-schema");
  });
});
