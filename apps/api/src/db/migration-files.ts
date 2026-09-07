// oxlint-disable-next-line import/no-nodejs-modules -- migrations are discovered on the server's own disk
import { readdir } from "node:fs/promises";

import type { Migration } from "kysely/migration";

import { FOLDED_MIGRATIONS } from "./migrations/_folded.js";
import * as noop from "./migrations/_noop.js";

const MIGRATIONS_URL = new URL("migrations/", import.meta.url);
const MIGRATION_FILE = /^\d{3}-.+\.(?<extension>ts|js)$/u;

export async function loadMigrations(): Promise<Record<string, Migration>> {
  const names: string[] = await readdir(MIGRATIONS_URL);
  const files = names
    .filter((name) => MIGRATION_FILE.test(name) && !name.includes(".test."))
    .toSorted();
  const loaded = await Promise.all(
    files.map(async (name): Promise<[string, Migration]> => {
      const module = (await import(new URL(name, MIGRATIONS_URL).href)) as Migration;
      return [name.replace(/\.(?<extension>ts|js)$/u, ""), { up: module.up, down: module.down }];
    }),
  );
  const migrations: Record<string, Migration> = {};
  for (const folded of FOLDED_MIGRATIONS) {
    migrations[folded] = noop;
  }
  for (const [name, migration] of loaded) {
    if (name in migrations) {
      throw new Error(`migration ${name} is listed as folded and present as a file`);
    }
    migrations[name] = migration;
  }
  return migrations;
}
