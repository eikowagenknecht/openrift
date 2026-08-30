import type { MetaSubmissionReason, MetaSubmissionStatus } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import type { Database, MetaSubmissionsTable } from "../db/index.js";
import { listOwnedByUser } from "./query-helpers.js";

export type MetaSubmissionRow = Selectable<MetaSubmissionsTable>;

export interface MetaSubmissionInsert {
  userId: string;
  provider: string;
  externalId: string;
  candidateMetaPlayerId: string;
  /** The live event the submission targets, or null when it proposes one. */
  metaEventId: string | null;
  /** What the submitter called the event, so the row still reads without a target. */
  eventName: string;
  playerName: string;
  note: string | null;
}

/**
 * The outcome ledger for user decklist submissions to the meta archive,
 * shaped like `card_submissions`.
 *
 * Separate from `candidate_meta_players` because staging is disposable and a
 * contributor's history is not: the candidate row is replaced, ignored or
 * deleted as the queue moves, and the person who sent it still needs to see
 * what happened. Provider uploads write nothing here — those sources are the
 * maintainer's own tooling.
 */
export function metaSubmissionsRepo(db: Kysely<Database>) {
  return {
    /**
     * Record a new submission. Called inside the submission transaction so a
     * candidate player never exists without its ledger row.
     */
    async insert(values: MetaSubmissionInsert): Promise<string> {
      const row = await db
        .insertInto("metaSubmissions")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * One contributor's submissions, newest first, keyset-paginated on the
     * `(user_id, created_at DESC, id DESC)` index. Always scoped by `userId`
     * here rather than at the call site. Returns up to `limit + 1` rows, so
     * the caller can detect a next page.
     */
    listByUser(
      userId: string,
      options: { cursor?: string | null; limit: number },
    ): Promise<MetaSubmissionRow[]> {
      return listOwnedByUser<MetaSubmissionRow>(db, "metaSubmissions", userId, options);
    },

    async byId(id: string): Promise<MetaSubmissionRow | null> {
      const row = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * The submission behind one staging row, or null when the candidate is not
     * a submission. This is how an accept finds the ledger entry to resolve.
     */
    async byCandidatePlayerId(candidateMetaPlayerId: string): Promise<MetaSubmissionRow | null> {
      const row = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("candidateMetaPlayerId", "=", candidateMetaPlayerId)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Stamp an outcome. `resolvedAt` is required by a CHECK for any non-pending
     * status, so it is not optional here either.
     */
    async resolve(
      id: string,
      values: {
        status: Exclude<MetaSubmissionStatus, "pending">;
        resolvedAt: Date;
        reason?: MetaSubmissionReason | null;
        note?: string | null;
        resolvedByUserId?: string | null;
        acceptedDeckId?: string | null;
      },
    ): Promise<void> {
      await db
        .updateTable("metaSubmissions")
        .set({
          status: values.status,
          resolvedAt: values.resolvedAt,
          resolutionReason: values.reason ?? null,
          resolutionNote: values.note ?? null,
          resolvedByUserId: values.resolvedByUserId ?? null,
          acceptedDeckId: values.acceptedDeckId ?? null,
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * The two writes an accepted contribution owes, in one transaction: the
     * public credit and the ledger's outcome.
     *
     * They live together because they are one fact seen from two sides — the
     * event page's "contributed by" line and the contributor's own "accepted"
     * row — and a crash between them would leave a person credited for
     * something their submission still calls pending, or the reverse. The
     * credit insert is idempotent, so re-accepting a corrected list is safe.
     *
     * Reaching `meta_credits` from here rather than through `metaRepo` is
     * deliberate: the atomicity is the point, and the two repos share the
     * connection anyway. `submissionId` is null when the contribution has no
     * ledger row.
     */
    async recordAcceptance(values: {
      submissionId: string | null;
      credit: { metaEventId: string; metaEventPlayerId: string | null; userId: string };
      acceptedDeckId: string | null;
      resolvedAt: Date;
      resolvedByUserId: string | null;
    }): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("metaCredits")
          .values(values.credit)
          .onConflict((oc) =>
            oc.columns(["metaEventId", "userId", "metaEventPlayerId"]).doNothing(),
          )
          .execute();

        if (values.submissionId === null) {
          return;
        }
        // The reason and note are left alone: an admin may have written the
        // contributor a message before accepting, and an accept is not a
        // reason to drop it.
        await trx
          .updateTable("metaSubmissions")
          .set({
            status: "accepted",
            resolvedAt: values.resolvedAt,
            resolvedByUserId: values.resolvedByUserId,
            acceptedDeckId: values.acceptedDeckId,
          })
          .where("id", "=", values.submissionId)
          .execute();
      });
    },

    /**
     * Return a submission to the queue, for a misclicked reject. Clears the
     * accepted deck but keeps any note the admin wrote.
     */
    async reopen(id: string): Promise<void> {
      await db
        .updateTable("metaSubmissions")
        .set({ status: "pending", resolvedAt: null, acceptedDeckId: null })
        .where("id", "=", id)
        .execute();
    },

    /**
     * How many of a user's submissions are still awaiting an outcome, for the
     * per-user cap. Counted on the ledger rather than on `candidate_meta_players`
     * so purging staging cannot hand a spammer a fresh allowance.
     */
    async countPendingByUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("metaSubmissions")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .where("status", "=", "pending")
        .executeTakeFirst();
      return row ? Number(row.count) : 0;
    },
  };
}
