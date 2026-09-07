import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export type HealthStatus = "ok" | "db_empty" | "db_not_migrated" | "db_unreachable";

class HealthTimeoutError extends Error {
  constructor() {
    super("health check timeout");
    this.name = "HealthTimeoutError";
  }
}

export function healthRepo(db: Kysely<Database>) {
  return {
    async healthCheck(timeoutMs: number): Promise<HealthStatus> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { promise: timeout, reject } = Promise.withResolvers<never>();
        timer = setTimeout(() => reject(new HealthTimeoutError()), timeoutMs);

        const check = async (): Promise<HealthStatus> => {
          await sql`SELECT 1`.execute(db);

          const [table] = await sql<{ exists: boolean }>`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'sets'
            ) AS exists
          `
            .execute(db)
            .then((r) => r.rows);

          if (!table) {
            throw new Error("schema-probe query returned no rows");
          }
          if (!table.exists) {
            return "db_not_migrated";
          }

          const rows = await db.selectFrom("sets").select("id").limit(1).execute();
          return rows.length > 0 ? "ok" : "db_empty";
        };

        return await Promise.race([check(), timeout]);
      } catch (error) {
        if (error instanceof HealthTimeoutError) {
          return "db_unreachable";
        }
        return "db_unreachable";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
