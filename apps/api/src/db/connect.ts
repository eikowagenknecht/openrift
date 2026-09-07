import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { TracingDialect } from "./tracing-dialect.js";
import type { Database } from "./types.js";

export function createDb(connectionString: string) {
  const innerDialect = new PostgresJSDialect({
    postgres: postgres(connectionString, {
      // Explicit so a postgres.js default change can't shift pool size silently.
      max: 20,
      types: {
        // date (OID 1082) returns "2024-01-15" strings; timestamps (1114, 1184)
        // stay native Date objects.
        date: {
          to: 1082,
          from: [1082],
          serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
          parse: (x: string) => x,
        },
      },
    }),
  });

  const dialect = new TracingDialect(innerDialect);

  return { db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }), dialect };
}
