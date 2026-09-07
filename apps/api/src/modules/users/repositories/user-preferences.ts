import type {
  EmailNotificationPreference,
  UserPreferencesResponse,
} from "@openrift/shared/types/api/preferences";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { UserPreferencesTable } from "../../../db/tables/settings.js";

/** A verified-email user who has opted into the daily match digest. */
export interface MatchDigestRecipient {
  userId: string;
  email: string;
  name: string | null;
}

/** An admin who has opted into the card-submission alert. */
export type CardSubmissionRecipient = MatchDigestRecipient;

/** A group owner/admin who has not opted out of the join-request alert. */
export type GroupJoinRequestRecipient = MatchDigestRecipient;

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

    /** The merge runs in SQL so two overlapping PATCHes cannot drop each other's keys. */
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
            // A key never appears in both `patch` and `removedKeys`.
            data: sql`(user_preferences.data || excluded.data) - ${removedKeys}::text[]`,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return row.data;
    },

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
     * The inner join on `admins` is the real gate; a demoted admin stops
     * receiving these without their stored preference changing.
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
     * Opt-out: the join to preferences is LEFT so a member with no
     * preferences row (never opened the profile page) still gets mailed.
     */
    async listGroupJoinRequestRecipients(groupId: string): Promise<GroupJoinRequestRecipient[]> {
      const rows = await db
        .selectFrom("friendGroupMembers as m")
        .innerJoin("users as u", "u.id", "m.userId")
        .leftJoin("userPreferences as up", "up.userId", "u.id")
        .select(["u.id as userId", "u.email as email", "u.name as name"])
        .where("m.groupId", "=", groupId)
        .where("m.role", "in", ["owner", "admin"])
        .where("u.emailVerified", "=", true)
        .where(
          sql<boolean>`(up.data -> 'emailNotifications' ->> 'groupJoinRequests') IS DISTINCT FROM 'false'`,
        )
        .execute();
      return rows;
    },

    /** Left-joins preferences so a user with no preferences row still resolves with empty `emailNotifications`. */
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
