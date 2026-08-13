import type { EmailNotificationPreference, UserPreferencesResponse } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import { parseJsonbRequired } from "../db/helpers.js";
import type { Database, UserPreferencesTable } from "../db/index.js";

/** A verified-email user who has opted into the daily match digest (ADR-030). */
export interface MatchDigestRecipient {
  userId: string;
  email: string;
  name: string | null;
}

/** An admin who has opted into the card-submission alert (ADR-036). */
export type CardSubmissionRecipient = MatchDigestRecipient;

/** The data needed to gate + address a transactional email to one user (ADR-030). */
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
      if (!row) {
        return undefined;
      }
      return { ...row, data: parseJsonbRequired<UserPreferencesResponse>(row.data) };
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

      return parseJsonbRequired<UserPreferencesResponse>(row.data);
    },

    /**
     * Verified-email users who have opted into the daily match digest (ADR-030).
     * The JSONB blob is double-encoded (a jsonb string scalar of the serialized
     * object, which is why reads go through `parseJsonbRequired`), so the
     * predicate unwraps it with
     * `data #>> '{}'` before drilling into `emailNotifications.tradeMatches`.
     * @returns Opted-in recipients with their email + name.
     */
    async listMatchDigestRecipients(): Promise<MatchDigestRecipient[]> {
      const rows = await db
        .selectFrom("userPreferences as up")
        .innerJoin("users as u", "u.id", "up.userId")
        .select(["u.id as userId", "u.email as email", "u.name as name"])
        .where("u.emailVerified", "=", true)
        .where(
          sql<boolean>`((up.data #>> '{}')::jsonb -> 'emailNotifications' ->> 'tradeMatches') = 'true'`,
        )
        .execute();
      return rows;
    },

    /**
     * Admins who opted into the card-submission alert (ADR-036). The inner join
     * on `admins` is the real gate: the preference is storable by anyone, but
     * only an admin can ever be a recipient, so a demoted admin stops receiving
     * these without their stored preference having to change. Same double-encoded
     * JSONB unwrap as {@link listMatchDigestRecipients}.
     * @returns Opted-in admin recipients with their email + name.
     */
    async listCardSubmissionRecipients(): Promise<CardSubmissionRecipient[]> {
      const rows = await db
        .selectFrom("userPreferences as up")
        .innerJoin("users as u", "u.id", "up.userId")
        .innerJoin("admins as a", "a.userId", "u.id")
        .select(["u.id as userId", "u.email as email", "u.name as name"])
        .where("u.emailVerified", "=", true)
        .where(
          sql<boolean>`((up.data #>> '{}')::jsonb -> 'emailNotifications' ->> 'cardSubmissions') = 'true'`,
        )
        .execute();
      return rows;
    },

    /**
     * Address + gate data for a single user's transactional email (ADR-030).
     * Left-joins preferences so a user with no preferences row still resolves
     * (empty `emailNotifications`, which reads as request-on / digest-off).
     * @returns The context, or `undefined` if the user does not exist.
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
      const data =
        row.data === null || row.data === undefined
          ? {}
          : parseJsonbRequired<UserPreferencesResponse>(row.data);
      return {
        email: row.email,
        emailVerified: row.emailVerified,
        name: row.name,
        emailNotifications: data.emailNotifications ?? {},
      };
    },
  };
}
