import type { Database } from "@openrift/shared/db";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Workaround for postgres.js connection pool leak during hot reload.
// In dev, store the instance on globalThis so it survives module reloads.
const globalSql = (globalThis as Record<string, unknown>).__sql as
  | ReturnType<typeof postgres>
  | undefined;
const sql = globalSql ?? postgres(connectionString);
(globalThis as Record<string, unknown>).__sql = sql;

export const dialect = new PostgresJSDialect({ postgres: sql });

export const db = new Kysely<Database>({ dialect });
