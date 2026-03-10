import type { Database } from "@openrift/shared/db";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

let _dialect: PostgresJSDialect | undefined;
let _db: Kysely<Database> | undefined;

export function getDialect(): PostgresJSDialect {
  if (!_dialect) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _dialect = new PostgresJSDialect({ postgres: postgres(connectionString) });
  }
  return _dialect;
}

export function getDb(): Kysely<Database> {
  if (!_db) {
    _db = new Kysely<Database>({ dialect: getDialect() });
  }
  return _db;
}

// Re-export as values via getters for backwards compatibility with existing imports
// that use `import { db, dialect } from "./db.js"`
export const dialect: PostgresJSDialect = new Proxy({} as PostgresJSDialect, {
  get(_, prop) {
    return Reflect.get(getDialect(), prop);
  },
});

export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
