import type { StagePresetConfig } from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";

import type { Database, StagePresetsTable } from "../db/index.js";

/** A preset row with its `config` jsonb parsed. */
export type StagePresetRow = Selectable<StagePresetsTable>;

/**
 * The `id` column is a uuid, so a value that is not one must never reach a
 * query — Postgres answers `22P02` and the request 500s. The public overlay
 * read takes a preset id straight from a browser-source URL, where anything at
 * all can appear, so the shape is checked before the lookup rather than after.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Queries for a creator's saved stage presets (migration 242).
 *
 * Every method is user-scoped and filters on `userId`, so a preset belonging to
 * someone else matches nothing rather than erroring — the routes carry no
 * separate ownership check. Duplicate names are left to the
 * `uq_stage_presets_user_name` index rather than a read-then-write, so two
 * concurrent creates give one preset and one conflict instead of two rows.
 *
 * @returns An object with stage-preset query methods bound to the given `db`.
 */
export function stagePresetsRepo(db: Kysely<Database>) {
  return {
    /** @returns The user's presets, ordered by name — the order the recall menu shows. */
    async listForUser(userId: string): Promise<StagePresetRow[]> {
      const rows = await db
        .selectFrom("stagePresets")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name", "asc")
        .execute();
      return rows;
    },

    /**
     * Resolves a preset an overlay URL names, scoped to the channel's owner.
     * @returns The preset, or `undefined` when the id is malformed, unknown, or
     * someone else's.
     */
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

    /** @returns How many presets the user has, for the per-user cap. */
    async countForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("stagePresets")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /** @returns The newly created preset. */
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
     * Applies a partial edit. An omitted field is left alone, so renaming a
     * preset does not restate its config. The caller only reaches this with at
     * least one field set — an empty SET is not valid SQL.
     * @returns The updated preset, or `undefined` when it isn't the caller's.
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

    /** @returns True if a preset was deleted. */
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
