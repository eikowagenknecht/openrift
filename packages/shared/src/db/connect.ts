/* eslint-disable no-console -- CLI helper */
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./types.js";

/**
 * Creates a Kysely instance from DATABASE_URL, or exits with an error.
 *
 * @returns A Kysely<Database> instance.
 */
export function createDb(): Kysely<Database> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required.");
    console.error(
      "Example: DATABASE_URL=postgres://riftbound_app:dev_password@localhost:5432/riftbound",
    );
    process.exit(1);
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
}
