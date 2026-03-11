import { createDb } from "@openrift/shared/db/connect";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const { db, dialect } = createDb(process.env.DATABASE_URL);
