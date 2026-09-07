import type { StagePresetConfig } from "@openrift/shared/contracts/stage-presets";
import type { Kysely, Selectable } from "kysely";

import type { Database, StagePresetsTable } from "../db/index.js";

/** A preset row with its `config` jsonb parsed. */
export type StagePresetRow = Selectable<StagePresetsTable>;

/**
 * Postgres 500s with `22P02` on a malformed uuid, and the public overlay read
 * takes this id straight from a browser-source URL, so shape is checked first.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Every method filters on `userId`: another user's preset matches nothing,
 * not an error, so routes carry no separate ownership check.
 */
export function stagePresetsRepo(db: Kysely<Database>) {
  return {
    async listForUser(userId: string): Promise<StagePresetRow[]> {
      const rows = await db
        .selectFrom("stagePresets")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name", "asc")
        .execute();
      return rows;
    },

    /** Returns `undefined` for a malformed, unknown, or someone else's id — never throws. */
    async findByIdForUser(id: string, userId: string): Promise<StagePresetRow | undefined> {
      if (!UUID_PATTERN.test(id)) {
        return undefined;
      }
      const row = await db
        .selectFrom("stagePresets")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row;
    },

    async countForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("stagePresets")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    async create(
      userId: string,
      values: { name: string; config: StagePresetConfig },
    ): Promise<StagePresetRow> {
      const row = await db
        .insertInto("stagePresets")
        .values({ userId, name: values.name, config: values.config })
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    },

    /**
     * An omitted field is left untouched, not cleared — the caller must set at
     * least one field, since an empty SET isn't valid SQL.
     */
    async update(
      id: string,
      userId: string,
      values: { name?: string; config?: StagePresetConfig },
    ): Promise<StagePresetRow | undefined> {
      const row = await db
        .updateTable("stagePresets")
        .set({
          ...(values.name !== undefined && { name: values.name }),
          ...(values.config !== undefined && { config: values.config }),
        })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      return row;
    },

    async remove(id: string, userId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("stagePresets")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },
  };
}
