import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

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
    dialect: new PostgresJSDialect({
      postgres: postgres(connectionString),
    }),
  });
}
