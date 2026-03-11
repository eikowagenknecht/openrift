/* oxlint-disable no-console -- CLI script */

import type { Kysely } from "kysely";
import { Migrator } from "kysely";

import { migrations } from "./migrations/index.js";
import type { Database } from "./types.js";

function createMigrator(db: Kysely<Database>) {
  return new Migrator({
    db,
    // oxlint-disable-next-line prefer-await-to-then -- wrapping a sync value in a Promise to satisfy Kysely's MigrationProvider interface
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });
}

export async function migrate(db: Kysely<Database>): Promise<void> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`  ✓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`  ✗ ${it.migrationName}`);
    }
  });
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (results?.length) {
    console.log("Migrations applied successfully.");
  } else {
    console.log("Already up to date.");
  }
}

export async function rollback(db: Kysely<Database>): Promise<void> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateDown();
  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`  ↓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`  ✗ ${it.migrationName}`);
    }
  });
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (results?.length) {
    console.log("Rolled back successfully.");
  } else {
    console.log("Nothing to roll back.");
  }
}

if (import.meta.main) {
  const { createDb } = await import("./connect.js");
  const db = createDb();
  const command = process.argv[2] ?? "latest";

  try {
    if (command === "latest") {
      await migrate(db);
    } else if (command === "down") {
      await rollback(db);
    } else {
      console.error(`Unknown command: ${command}`);
      console.error("Usage: db:migrate [latest|down]");
      process.exit(1);
    }
  } catch (error) {
    console.error(command === "latest" ? "Migration failed:" : "Rollback failed:", error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}
