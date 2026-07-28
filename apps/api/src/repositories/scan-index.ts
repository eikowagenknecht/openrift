import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export interface ScanIndexRow {
  formatVersion: number;
  bankHash: string;
  entryCount: number;
  encoderTag: string;
  watermark: Date | null;
  builtAt: Date;
  durationMs: number;
}

/**
 * Repository for the scanner bank's singleton metadata row (see migration
 * 213): which content-hashed bank generation under `media/scan/` is current.
 *
 * @returns An object with scan-index query/mutation methods bound to `db`.
 */
export function scanIndexRepo(db: Kysely<Database>) {
  return {
    /**
     * The current bank generation.
     *
     * @returns The row, or null when no bank has ever been built.
     */
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

    /**
     * Record a freshly built bank generation as current.
     *
     * @returns Nothing; the singleton row is inserted or replaced.
     */
    async put(row: ScanIndexRow): Promise<void> {
      await db
        .insertInto("scanIndex")
        .values({ id: 1, ...row })
        .onConflict((oc) => oc.column("id").doUpdateSet({ ...row }))
        .execute();
    },
  };
}
