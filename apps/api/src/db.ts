import type { Database } from "@openrift/shared/db";
import { SQL } from "bun";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Workaround for Bun.sql connection pool leak during hot reload (oven-sh/bun#23215).
// In dev, store the SQL instance on globalThis so it survives module reloads.
const globalSql = (globalThis as Record<string, unknown>).__sql as SQL | undefined;
const sql = globalSql ?? new SQL(connectionString);
(globalThis as Record<string, unknown>).__sql = sql;

export const dialect = new PostgresJSDialect({ postgres: sql });

export const db = new Kysely<Database>({ dialect });
