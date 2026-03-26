import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

type HealthStatus = "ok" | "db_empty" | "db_not_migrated" | "db_unreachable";

class HealthTimeoutError extends Error {
  constructor() {
    super("health check timeout");
    this.name = "HealthTimeoutError";
  }
}

/**
 * Generic database health checks, decoupled from any domain table.
 * @returns Health repository with check methods.
 */
export function healthRepo(db: Kysely<Database>) {
  return {
    /**
     * Verifies database connectivity, migration state, and data presence.
     *
     * 1. `SELECT 1` — can we reach the database at all?
     * 2. Check `information_schema.tables` for the `sets` table — have migrations run?
     * 3. `SELECT id FROM sets LIMIT 1` — is there any data?
     * @returns The current health status of the database.
     */
    async healthCheck(timeoutMs: number): Promise<HealthStatus> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // oxlint-disable-next-line promise/avoid-new -- Promise.race needs a timeout promise
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new HealthTimeoutError()), timeoutMs);
        });

        const check = async (): Promise<HealthStatus> => {
          // 1. Connectivity
          await sql`SELECT 1`.execute(db);

          // 2. Migration state — check for a core table
          const [table] = await sql<{ exists: boolean }>`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'sets'
            ) AS exists
          `
            .execute(db)
            .then((r) => r.rows);

          if (!table.exists) {
            return "db_not_migrated";
          }

          // 3. Data presence
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
