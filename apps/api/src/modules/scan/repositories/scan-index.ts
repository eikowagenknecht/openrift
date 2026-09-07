import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface ScanIndexRow {
  formatVersion: number;
  bankHash: string;
  entryCount: number;
  encoderTag: string;
  watermark: Date | null;
  builtAt: Date;
  durationMs: number;
}

export function scanIndexRepo(db: Kysely<Database>) {
  return {
    async get(): Promise<ScanIndexRow | null> {
      const row = await db
        .selectFrom("scanIndex")
        .select([
          "formatVersion",
          "bankHash",
          "entryCount",
          "encoderTag",
          "watermark",
          "builtAt",
          "durationMs",
        ])
        .where("id", "=", 1)
        .executeTakeFirst();
      return row ?? null;
    },

    async put(row: ScanIndexRow): Promise<void> {
      await db
        .insertInto("scanIndex")
        .values({ id: 1, ...row })
        .onConflict((oc) => oc.column("id").doUpdateSet({ ...row }))
        .execute();
    },
  };
}
