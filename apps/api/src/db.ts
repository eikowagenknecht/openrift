import type { Database } from "@openrift/shared/db";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({ connectionString });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
