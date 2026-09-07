import type { MetaCreditVisibility } from "@openrift/shared/types/enums";
import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

/**
 * One contributor as an event page prints them. The name is resolved at read
 * time from the user's profile and their `meta_credit_visibility`, so a rename
 * or an opt-out reaches every past contribution with no sweep across rows.
 */
export interface MetaContributorRow {
  metaEventId: string;
  userId: string;
  /** Never empty: a contributor whose chosen field is blank is dropped instead. */
  displayName: string;
}

export function metaCreditsRepo(db: Kysely<Database>) {
  /** A blank result drops the row; it never partially prints a user id. */
  function contributorQuery() {
    const displayName = sql<string>`nullif(btrim(case
      when u.meta_credit_visibility = 'riot_id' then coalesce(nullif(btrim(u.riot_id), ''), u.name)
      else u.name
    end), '')`;
    return db
      .selectFrom("metaCredits as mc")
      .innerJoin("users as u", "u.id", "mc.userId")
      .select(["mc.metaEventId", "mc.userId"])
      .select(displayName.as("displayName"))
      .distinct()
      .where("u.metaCreditVisibility", "!=", "hidden")
      .where(sql<SqlBool>`${displayName} is not null`)
      .orderBy("displayName", "asc")
      .orderBy("mc.userId", "asc");
  }

  return {
    /**
     * Records one contribution; a null `metaEventPlayerId` credits the event
     * itself. Idempotent on the contribution's unique index (`NULLS NOT
     * DISTINCT`, so a second event-level credit for the same user is the same
     * row), because an accept is legitimately re-run — a corrected list, a
     * re-upload — and a contributor is credited once per thing they
     * contributed, not once per click.
     */
    async insertCredit(values: {
      metaEventId: string;
      metaEventPlayerId: string | null;
      userId: string;
    }): Promise<void> {
      await db
        .insertInto("metaCredits")
        .values(values)
        .onConflict((oc) => oc.columns(["metaEventId", "userId", "metaEventPlayerId"]).doNothing())
        .execute();
    },

    /**
     * Deleting the standings row itself cascades; this is the narrower case of
     * taking a credit back while the row stays. Several people can have
     * contributed to one entry, so the unlink path always passes `userId`.
     */
    async deleteCreditsForPlayer(metaEventPlayerId: string, userId?: string): Promise<void> {
      let query = db.deleteFrom("metaCredits").where("metaEventPlayerId", "=", metaEventPlayerId);
      if (userId !== undefined) {
        query = query.where("userId", "=", userId);
      }
      await query.execute();
    },

    /**
     * Reads `users.meta_credit_visibility` live, not frozen onto the credit
     * row: opting out removes all past credits immediately.
     */
    contributorsForEvent(eventId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventId", "=", eventId).execute();
    },

    contributorsForPlayer(metaEventPlayerId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventPlayerId", "=", metaEventPlayerId).execute();
    },

    /**
     * The column lives on `users` but its meaning is this domain's: it is the
     * consent behind {@link contributorsForEvent}, and reading it anywhere
     * else would be reading a meta-archive rule out of context.
     */
    async creditVisibility(userId: string): Promise<MetaCreditVisibility | undefined> {
      const row = await db
        .selectFrom("users")
        .select("metaCreditVisibility")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.metaCreditVisibility;
    },

    /**
     * No row changes here: the public read resolves visibility live, so
     * opting in credits every past contribution and opting out removes them
     * all.
     */
    async setCreditVisibility(userId: string, visibility: MetaCreditVisibility): Promise<boolean> {
      const result = await db
        .updateTable("users")
        .set({ metaCreditVisibility: visibility })
        .where("id", "=", userId)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },
  };
}
