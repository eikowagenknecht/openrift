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
        date: {
          to: 1184,
          from: [1082],
          serialize: (x: string) => x,
          parse: (x: string) => x,
        },
      },
    }),
  });

  return { db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }), dialect };
}
