import type { Database } from "@openrift/shared/db";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const dialect = new PostgresJSDialect({
  postgres: postgres(connectionString),
});

export const db = new Kysely<Database>({ dialect });
