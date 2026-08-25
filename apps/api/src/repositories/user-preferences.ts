import type { EmailNotificationPreference, UserPreferencesResponse } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, UserPreferencesTable } from "../db/index.js";

/** A verified-email user who has opted into the daily match digest. */
export interface MatchDigestRecipient {
  userId: string;
  email: string;
  name: string | null;
}

/** An admin who has opted into the card-submission alert. */
export type CardSubmissionRecipient = MatchDigestRecipient;

/** The data needed to gate + address a transactional email to one user. */
export interface EmailNotificationContext {
  email: string;
  emailVerified: boolean;
  name: string | null;
  emailNotifications: EmailNotificationPreference;
}

/** Incoming PATCH body — values can be null (reset to default) or undefined (don't touch). */
export type PartialPreferences = {
  [K in keyof UserPreferencesResponse]?: UserPreferencesResponse[K] extends Record<string, unknown>
    ? Partial<UserPreferencesResponse[K]> | null
    : UserPreferencesResponse[K] | null;
};

export function userPreferencesRepo(db: Kysely<Database>) {
  return {
    async getByUserId(userId: string): Promise<Selectable<UserPreferencesTable> | undefined> {
      const row = await db
        .selectFrom("userPreferences")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row;
    },

    /**
     * Applies a partial preferences patch: `null` removes a key (resetting it
     * to the default), `undefined` leaves it alone, any other value replaces
     * the whole top-level key.
     *
     * The merge happens in SQL, not in JS. Reading the row, merging, and
     * writing the result back is a lost update: two PATCHes overlapping in
     * time each wrote the snapshot they had read, so whichever committed last
     * silently dropped the other's keys. `jsonb ||` is exactly the shallow
     * top-level replace the JS merge did, and `jsonb - text[]` performs the
     * null-means-reset deletes, so the semantics are unchanged.
     */
    async upsert(userId: string, incoming: PartialPreferences): Promise<UserPreferencesResponse> {
      const patch: Record<string, unknown> = {};
      const removedKeys: string[] = [];
      for (const [key, value] of Object.entries(incoming)) {
        if (value === undefined) {
          continue;
        }
        if (value === null) {
          removedKeys.push(key);
        } else {
          patch[key] = value;
        }
      }

      const row = await db
        .insertInto("userPreferences")
        .values({ userId, data: patch })
        .onConflict((oc) =>
          oc.column("userId").doUpdateSet({
            // `excluded` is the row this statement proposed, i.e. the patch.
            // The removals run last, though a key can never be in both halves.
            data: sql`(user_preferences.data || excluded.data) - ${removedKeys}::text[]`,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return row.data;
    },

    /** Verified-email users who have opted into the daily match digest. */
    async listMatchDigestRecipients(): Promise<MatchDigestRecipient[]> {
      const rows = await db
        .selectFrom("userPreferences as up")
        .innerJoin("users as u", "u.id", "up.userId")
        .select(["u.id as userId", "u.email as email", "u.name as name"])
        .where("u.emailVerified", "=", true)
        .where(sql<boolean>`(up.data -> 'emailNotifications' ->> 'tradeMatches') = 'true'`)
        .execute();
      return rows;
    },

    /**
     * The inner join on `admins` is the real gate: the preference is storable
     * by anyone, but only an admin can ever be a recipient, so a demoted
     * admin stops receiving these without their stored preference having to
     * change.
     */
    async listCardSubmissionRecipients(): Promise<CardSubmissionRecipient[]> {
      const rows = await db
        .selectFrom("userPreferences as up")
        .innerJoin("users as u", "u.id", "up.userId")
        .innerJoin("admins as a", "a.userId", "u.id")
        .select(["u.id as userId", "u.email as email", "u.name as name"])
        .where("u.emailVerified", "=", true)
        .where(sql<boolean>`(up.data -> 'emailNotifications' ->> 'cardSubmissions') = 'true'`)
        .execute();
      return rows;
    },

    /**
     * Left-joins preferences so a user with no preferences row still resolves
     * (empty `emailNotifications`, which reads as request-on / digest-off).
     */
    async getEmailNotificationContext(
      userId: string,
    ): Promise<EmailNotificationContext | undefined> {
      const row = await db
        .selectFrom("users as u")
        .leftJoin("userPreferences as up", "up.userId", "u.id")
        .select([
          "u.email as email",
          "u.emailVerified as emailVerified",
          "u.name as name",
          "up.data",
        ])
        .where("u.id", "=", userId)
        .executeTakeFirst();
      if (row === undefined) {
        return undefined;
      }
      const data: UserPreferencesResponse = row.data ?? {};
      return {
        email: row.email,
        emailVerified: row.emailVerified,
        name: row.name,
        emailNotifications: data.emailNotifications ?? {},
      };
    },
  };
}
