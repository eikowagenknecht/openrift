/* oxlint-disable import/no-nodejs-modules -- standalone CLI script that shells out to docker/pg_dump */
import { execSync } from "node:child_process";

import { createDb } from "../apps/api/src/db/connect.js";
import { migrate } from "../apps/api/src/db/migrate.js";
import { createLogger } from "../packages/shared/src/logger.js";
import { requireEnv } from "./env.js";

// Regenerates docs/schema.sql from a FRESH migrate against a throwaway database,
// NEVER from the shared dev DB. The dev DB drifts whenever an already-applied
// migration is edited (PostgreSQL keeps original column ordinals), so dumping it
// produces a schema that no longer matches what the migrations actually create —
// which fails the schema-snapshot integration test. A clean migrate is the
// source of truth.
const log = createLogger("db:schema");
const url = requireEnv("DATABASE_URL");
const TEMP_DB = "openrift_schema_dump";
const CONTAINER = "openrift-db-1";

/** @returns The connection URL pointed at a different database name. */
function withDatabase(connectionUrl: string, dbName: string): string {
  return connectionUrl.replace(/\/[^/?]+(?<tail>\?|$)/u, `/${dbName}$<tail>`);
}

function psql(sql: string): void {
  execSync(`docker exec ${CONTAINER} psql -U openrift -d postgres -c '${sql}'`, {
    stdio: "ignore",
  });
}

psql(`DROP DATABASE IF EXISTS "${TEMP_DB}"`);
psql(`CREATE DATABASE "${TEMP_DB}"`);

const { db } = createDb(withDatabase(url, TEMP_DB));
try {
  await migrate(db, log);
} finally {
  await db.destroy();
}

execSync(
  `docker exec ${CONTAINER} pg_dump -U openrift --schema-only --no-owner --no-privileges ${TEMP_DB} > docs/schema.sql`,
  { stdio: "inherit" },
);

psql(`DROP DATABASE IF EXISTS "${TEMP_DB}"`);
log.info("docs/schema.sql regenerated from a fresh migrate");
