import type { Logger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { Migrator } from "kysely/migration";

import { migrations } from "./migrations/index.js";
import type { Database } from "./types.js";

function createMigrator(db: Kysely<Database>) {
  return new Migrator({
    db,
    // oxlint-disable-next-line prefer-await-to-then -- wrapping a sync value in a Promise to satisfy Kysely's MigrationProvider interface
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });
}

/**
 * The canonical migration order is the name sort: Kysely resolves the migration
 * list with the default JS string sort (`Object.keys(migrations).sort()`), so we
 * order names the same way here rather than relying on the database's collation.
 */
function canonicalOrder(names: string[]): string[] {
  return [...names].sort();
}

/**
 * Ensure the internal `kysely_migration` table's timestamps encode a
 * deterministic, monotonically-increasing order keyed by migration name,
 * repairing the recorded order if a backward clock step has corrupted it.
 *
 * Kysely stamps each applied migration with a wall-clock `new Date()` value and
 * later orders the executed migrations purely by that timestamp. On hosts where
 * the system clock can step backward mid-run — observed under load in WSL2,
 * where a batch migrate saw the clock jump back ~350ms between two inserts — the
 * stored timestamps come out non-monotonic. After that, Kysely's own
 * `ensureMigrationsInOrder` check throws "corrupted migrations" on every
 * subsequent migrate, and `migrateDown` rolls back in the wrong order.
 *
 * Calling this before Kysely inspects the table (and again after new migrations
 * are applied) re-stamps the rows in name order with a clock-independent
 * sequence, so the recorded order always matches the order Kysely expects. It is
 * a no-op when the table is absent, empty, or already correctly ordered, so it
 * costs a single read on a healthy database and only writes when repairing.
 */
async function normalizeMigrationTimestamps(db: Kysely<Database>): Promise<void> {
  const { rows: exists } = await sql<{ present: boolean }>`
    SELECT to_regclass('kysely_migration') IS NOT NULL AS present
  `.execute(db);
  if (!exists[0]?.present) {
    return;
  }

  const { rows } = await sql<{ name: string; timestamp: string }>`
    SELECT name, timestamp FROM kysely_migration
  `.execute(db);
  if (rows.length === 0) {
    return;
  }

  const nameOrder = canonicalOrder(rows.map((row) => row.name));
  // Replicate Kysely's executed-migration ordering (timestamp ascending, name as
  // the tiebreak) to check whether the recorded order already matches the
  // canonical name order. If it does, there is nothing to repair.
  const recordedOrder = [...rows]
    .sort((first, second) => {
      const delta = new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime();
      return delta === 0 ? first.name.localeCompare(second.name) : delta;
    })
    .map((row) => row.name);
  if (recordedOrder.every((name, index) => name === nameOrder[index])) {
    return;
  }

  // Re-stamp in name order with a strictly increasing sequence (one second
  // apart) that does not depend on the wall clock.
  const assignments = nameOrder.map(
    (name, index) => sql`(${name}, ${new Date(index * 1000).toISOString()})`,
  );
  await sql`
    UPDATE kysely_migration AS km
    SET timestamp = normalized.ts
    FROM (VALUES ${sql.join(assignments)}) AS normalized(name, ts)
    WHERE km.name = normalized.name
  `.execute(db);
}

export async function migrate(db: Kysely<Database>, log: Logger): Promise<void> {
  // Repair any prior clock-step corruption before Kysely's ordering check runs.
  await normalizeMigrationTimestamps(db);

  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((it) => {
    if (it.status === "Success") {
      log.info(`✓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      log.error(`✗ ${it.migrationName}`);
    }
  });
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (results?.length) {
    // A backward wall-clock step during this run can leave the freshly-recorded
    // order non-monotonic; re-normalize so the table is left in a clean state.
    await normalizeMigrationTimestamps(db);
    log.info("Migrations applied successfully");
  } else {
    log.info("Already up to date");
  }
}

export async function rollback(db: Kysely<Database>, log: Logger): Promise<void> {
  // Repair any prior clock-step corruption so migrateDown rolls back in the
  // correct reverse order.
  await normalizeMigrationTimestamps(db);

  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateDown();
  results?.forEach((it) => {
    if (it.status === "Success") {
      log.info(`↓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      log.error(`✗ ${it.migrationName}`);
    }
  });
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (results?.length) {
    log.info("Rolled back successfully");
  } else {
    log.info("Nothing to roll back");
  }
}
