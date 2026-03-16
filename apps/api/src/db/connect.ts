import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import type { Database } from "./types.js";

/**
 * Creates a Kysely instance and its dialect from a connection string.
 *
 * @returns The Kysely instance and its dialect.
 */
export function createDb(connectionString: string) {
  const dialect = new PostgresJSDialect({
    postgres: postgres(connectionString),
  });

  return { db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }), dialect };
}
