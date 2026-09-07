import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/index.js";

export interface JobScheduleRow {
  kind: string;
  schedule: string;
  updatedAt: Date;
}

/** A job runs only while it has a row here. */
export function jobSchedulesRepo(db: Kysely<Database>) {
  return {
    listAll(): Promise<JobScheduleRow[]> {
      return db.selectFrom("jobSchedules").selectAll().orderBy("kind").execute();
    },

    async get(kind: string): Promise<JobScheduleRow | null> {
      const row = await db
        .selectFrom("jobSchedules")
        .selectAll()
        .where("kind", "=", kind)
        .executeTakeFirst();
      return row ?? null;
    },

    async upsert(kind: string, schedule: string): Promise<void> {
      await db
        .insertInto("jobSchedules")
        .values({ kind, schedule })
        .onConflict((oc) =>
          oc.column("kind").doUpdateSet({ schedule, updatedAt: sql<Date>`now()` }),
        )
        .execute();
    },

    async remove(kind: string): Promise<void> {
      await db.deleteFrom("jobSchedules").where("kind", "=", kind).execute();
    },
  };
}
