/* eslint-disable no-console -- CLI script */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  console.error(
    "Example: DATABASE_URL=postgres://riftbound_app:dev_password@localhost:5432/riftbound",
  );
  process.exit(1);
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString }),
  }),
});

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: path.join(__dirname, "migrations"),
  }),
});

const command = process.argv[2] ?? "latest";

if (command === "latest") {
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`  ✓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`  ✗ ${it.migrationName}`);
    }
  });
  if (error) {
    console.error("Migration failed:", error);
    await db.destroy();
    process.exit(1);
  }
  if (!results?.length) {
    console.log("Already up to date.");
  } else {
    console.log("Migrations applied successfully.");
  }
} else if (command === "down") {
  const { error, results } = await migrator.migrateDown();
  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`  ↓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`  ✗ ${it.migrationName}`);
    }
  });
  if (error) {
    console.error("Rollback failed:", error);
    await db.destroy();
    process.exit(1);
  }
  if (!results?.length) {
    console.log("Nothing to roll back.");
  } else {
    console.log("Rolled back successfully.");
  }
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: db:migrate [latest|down]");
  await db.destroy();
  process.exit(1);
}

await db.destroy();
