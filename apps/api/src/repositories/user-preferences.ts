import { ALL_MARKETPLACES } from "@openrift/shared";
import type { UserPreferencesResponse } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import type { Database, UserPreferencesTable } from "../db/index.js";

/** Partial preferences matching the shape accepted by the PATCH endpoint. */
export type PartialPreferences = {
  [K in keyof UserPreferencesResponse]?: UserPreferencesResponse[K] extends Record<string, unknown>
    ? Partial<UserPreferencesResponse[K]>
    : UserPreferencesResponse[K];
};

export const PREFERENCES_DEFAULTS: UserPreferencesResponse = {
  showImages: true,
  fancyFan: true,
  foilEffect: "animated",
  cardTilt: true,
  visibleFields: { number: true, title: true, type: true, rarity: true, price: true },
  theme: "light",
  marketplaceOrder: [...ALL_MARKETPLACES],
};

export function userPreferencesRepo(db: Kysely<Database>) {
  return {
    getByUserId(userId: string): Promise<Selectable<UserPreferencesTable> | undefined> {
      return db
        .selectFrom("userPreferences")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    async upsert(userId: string, incoming: PartialPreferences): Promise<UserPreferencesResponse> {
      const existing = await this.getByUserId(userId);
      const current = existing?.data ?? PREFERENCES_DEFAULTS;
      const merged: UserPreferencesResponse = {
        ...current,
        ...incoming,
        visibleFields: {
          ...current.visibleFields,
          ...incoming.visibleFields,
        },
      };

      const row = await db
        .insertInto("userPreferences")
        .values({ userId, data: JSON.stringify(merged) })
        .onConflict((oc) => oc.column("userId").doUpdateSet({ data: JSON.stringify(merged) }))
        .returningAll()
        .executeTakeFirstOrThrow();

      return row.data;
    },
  };
}
