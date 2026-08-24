import type { MetaSubmissionReason, MetaSubmissionStatus } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import type { Database, MetaDeckSubmissionsTable } from "../db/index.js";
import { listOwnedByUser } from "./query-helpers.js";

/** One ledger row exactly as stored. */
export type MetaDeckSubmissionRow = Selectable<MetaDeckSubmissionsTable>;

/** Columns a submission insert supplies; the rest are defaulted by the table. */
export interface MetaDeckSubmissionInput {
  userId: string;
  provider: string;
  externalId: string;
  candidateMetaDeckId: string;
  /** The live event the submission targets, or null when it proposes one. */
  metaEventId: string | null;
  /** What the submitter called the event, so the row still reads without a target. */
  eventName: string;
  playerName: string;
  note: string | null;
}

/**
 * The outcome ledger for user decklist submissions to the meta archive
 * (ADR-014, migration 255), shaped like `card_submissions` (ADR-036).
 *
 * Separate from `candidate_meta_decks` because staging is disposable and a
 * contributor's history is not: the candidate row is replaced, ignored or
 * deleted as the queue moves, and the person who sent it still needs to see
 * what happened. Provider uploads write nothing here — those sources are the
 * maintainer's own tooling.
 *
 * @returns An object with submission-ledger methods bound to the given `db`.
 */
export function metaSubmissionsRepo(db: Kysely<Database>) {
  return {
    /**
     * Record a new submission. Called inside the submission transaction so a
     * candidate deck never exists without its ledger row.
     * @param values The submission's identity and what it claims.
     * @returns The new submission's id.
     */
    async insert(values: MetaDeckSubmissionInput): Promise<string> {
      const row = await db
        .insertInto("metaDeckSubmissions")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * One contributor's submissions, newest first, keyset-paginated on the
     * `(user_id, created_at DESC, id DESC)` index. Always scoped by `userId`
     * here rather than at the call site.
     * @param userId The contributor.
     * @param options The cursor from the previous page and the page size.
     * @returns Up to `limit + 1` rows, so the caller can detect a next page.
     */
    listByUser(
      userId: string,
      options: { cursor?: string | null; limit: number },
    ): Promise<MetaDeckSubmissionRow[]> {
      return listOwnedByUser<MetaDeckSubmissionRow>(db, "metaDeckSubmissions", userId, options);
    },

    /** @returns The submission with that id, or null. */
    async byId(id: string): Promise<MetaDeckSubmissionRow | null> {
      const row = await db
        .selectFrom("metaDeckSubmissions")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * The submission behind one staging row. This is how an accept finds the
     * ledger entry to resolve: the candidate deck carries the submitter, and
     * the ledger points back at the candidate.
     * @param candidateMetaDeckId The staged deck.
     * @returns The submission, or null when the candidate is not a submission.
     */
    async byCandidateDeckId(candidateMetaDeckId: string): Promise<MetaDeckSubmissionRow | null> {
      const row = await db
        .selectFrom("metaDeckSubmissions")
        .selectAll()
        .where("candidateMetaDeckId", "=", candidateMetaDeckId)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Stamp an outcome. `resolvedAt` is required by a CHECK for any non-pending
     * status, so it is not optional here either.
     * @param id The submission to resolve.
     * @param values The outcome, the reason and note the contributor sees, and
     *   the archived deck an accept produced.
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
        .updateTable("metaDeckSubmissions")
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
     * connection anyway.
     *
     * @param values The credit to write, the ledger row to settle (null when
     *   the contribution has none), and who settled it.
     */
    async recordAcceptance(values: {
      submissionId: string | null;
      credit: { metaEventId: string; deckId: string | null; userId: string };
      acceptedDeckId: string | null;
      resolvedAt: Date;
      resolvedByUserId: string | null;
    }): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("metaCredits")
          .values(values.credit)
          .onConflict((oc) => oc.columns(["metaEventId", "userId", "deckId"]).doNothing())
          .execute();

        if (values.submissionId === null) {
          return;
        }
        // The reason and note are left alone: an admin may have written the
        // contributor a message before accepting, and an accept is not a
        // reason to drop it.
        await trx
          .updateTable("metaDeckSubmissions")
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
     * @param id The submission to reopen.
     */
    async reopen(id: string): Promise<void> {
      await db
        .updateTable("metaDeckSubmissions")
        .set({ status: "pending", resolvedAt: null, acceptedDeckId: null })
        .where("id", "=", id)
        .execute();
    },

    /**
     * How many of a user's submissions are still awaiting an outcome, for the
     * per-user cap. Counted on the ledger rather than on `candidate_meta_decks`
     * so purging staging cannot hand a spammer a fresh allowance.
     * @param userId The contributor.
     * @returns Their pending submission count.
     */
    async countPendingByUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("metaDeckSubmissions")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .where("status", "=", "pending")
        .executeTakeFirst();
      return row ? Number(row.count) : 0;
    },
  };
}
