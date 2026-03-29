import type { UserPreferencesResponse } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import type { Database, UserPreferencesTable } from "../db/index.js";

/** Incoming PATCH body — values can be null (reset to default) or undefined (don't touch). */
export type PartialPreferences = {
  [K in keyof UserPreferencesResponse]?: UserPreferencesResponse[K] extends Record<string, unknown>
    ? Partial<UserPreferencesResponse[K]> | null
    : UserPreferencesResponse[K] | null;
};

/** postgres.js under Bun returns jsonb columns as a string instead of a parsed
 *  object. This helper normalises the value so callers always get an object.
 *  @returns the parsed preferences object */
function parseData(data: UserPreferencesResponse | string): UserPreferencesResponse {
  return typeof data === "string" ? (JSON.parse(data) as UserPreferencesResponse) : data;
}

export function userPreferencesRepo(db: Kysely<Database>) {
  return {
    async getByUserId(userId: string): Promise<Selectable<UserPreferencesTable> | undefined> {
      const row = await db
        .selectFrom("userPreferences")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }
      return { ...row, data: parseData(row.data) };
    },

    async upsert(userId: string, incoming: PartialPreferences): Promise<UserPreferencesResponse> {
      const existing = await this.getByUserId(userId);
      const current: Record<string, unknown> = (existing?.data as Record<string, unknown>) ?? {};

      // Merge: null removes the key (reset to default), undefined skips, value sets.
      // Build a new object to avoid dynamic deletes.
      const draft = new Map(Object.entries(current));
      for (const [key, value] of Object.entries(incoming)) {
        if (value === undefined) {
          continue;
        }
        if (value === null) {
          draft.delete(key);
        } else if (key === "visibleFields" && typeof value === "object") {
          const currentVf =
            typeof draft.get("visibleFields") === "object" && draft.get("visibleFields") !== null
              ? (draft.get("visibleFields") as Record<string, unknown>)
              : {};
          const vfMap = new Map(Object.entries(currentVf));
          for (const [vfKey, vfVal] of Object.entries(value as Record<string, unknown>)) {
            if (vfVal === null) {
              vfMap.delete(vfKey);
            } else if (vfVal !== undefined) {
              vfMap.set(vfKey, vfVal);
            }
          }
          if (vfMap.size > 0) {
            draft.set("visibleFields", Object.fromEntries(vfMap));
          } else {
            draft.delete("visibleFields");
          }
        } else {
          draft.set(key, value);
        }
      }
      const merged = Object.fromEntries(draft);

      const row = await db
        .insertInto("userPreferences")
        .values({ userId, data: JSON.stringify(merged) })
        .onConflict((oc) => oc.column("userId").doUpdateSet({ data: JSON.stringify(merged) }))
        .returningAll()
        .executeTakeFirstOrThrow();

      return parseData(row.data);
    },
  };
}
