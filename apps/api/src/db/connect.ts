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
    postgres: postgres(connectionString, {
      types: {
        // Override only `date` (OID 1082) so Postgres returns "2024-01-15"
        // strings instead of Date objects. Timestamps (1114, 1184) are left
        // as native Date objects deliberately.
        date: {
          to: 1082,
          from: [1082],
          serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
          parse: (x: string) => x,
        },
      },
    }),
  });

  return { db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }), dialect };
}
