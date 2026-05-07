import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { TracingDialect } from "./tracing-dialect.js";
import type { Database } from "./types.js";

/**
 * Creates a Kysely instance and its dialect from a connection string. The
 * dialect is wrapped with `TracingDialect` so each query emits an OTel
 * `db.query` child span under the active context (request span set by the
 * Hono middleware, or the cron span set by runJob). When the OTel SDK is
 * not initialized (no `OTEL_EXPORTER_OTLP_ENDPOINT`) the tracer falls back
 * to a NoOp implementation and span creation is essentially free.
 *
 * @returns The Kysely instance and its (wrapped) dialect.
 */
export function createDb(connectionString: string) {
  const innerDialect = new PostgresJSDialect({
    postgres: postgres(connectionString, {
      // Single API instance; Postgres max_connections defaults to 100.
      // Explicit so a postgres.js default change can't shift pool size silently.
      max: 20,
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

  const dialect = new TracingDialect(innerDialect);

  return { db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }), dialect };
}
