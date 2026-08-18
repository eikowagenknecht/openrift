import { ERROR_CODES } from "@openrift/shared";
import { adminMetaSubmissionsContract } from "@openrift/shared/contracts/admin/meta-submissions";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { toAdminMetaSubmission } from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { MetaDeckSubmissionRow } from "../../repositories/meta-submissions.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";

const os = implement(adminMetaSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Loads the submission a write names, refusing the one outcome an admin must
 * not overwrite.
 *
 * An accepted submission was settled in the same transaction as the
 * contributor's public credit and the archived deck it produced. Stamping
 * "rejected" over that would leave the ledger, the credit line, and the archive
 * telling three different stories; taking the deck back out is `unlink`'s job,
 * and that removes the credit with it.
 *
 * @param repos The repositories.
 * @param id The submission.
 * @returns The row, guaranteed not to be `accepted`.
 */
async function requireUnsettled(
  repos: ApiContext["repos"],
  id: string,
): Promise<MetaDeckSubmissionRow> {
  const submission = await repos.metaSubmissions.byId(id);
  if (submission === null) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Submission not found");
  }
  if (submission.status === "accepted") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "That submission was already accepted. Unlink its candidate to take the deck back.",
    );
  }
  return submission;
}

/**
 * Admin side of meta decklist submissions (ADR-014's User submissions).
 *
 * The card pipeline derives a submission's outcome from the check and ignore
 * verbs its review loop already uses. This one cannot: a submitted deck hangs
 * off a live event and carries no source-event key, so there is no ignore entry
 * to represent it and nothing for an outcome to fall out of. The verb is
 * explicit here instead — without it a submission can only ever reach
 * `accepted`, and a contributor whose list was turned down reads "pending"
 * forever.
 *
 * Resolving does not delete the staged candidate deck. That is what lets
 * {@link adminMetaSubmissionsRouter.reopen} actually undo a misclick, and the
 * cost of the alternative is somebody's decklist gone on one wrong button.
 */
export const adminMetaSubmissionsRouter = {
  forCandidateDeck: os.forCandidateDeck.handler(async ({ input, context }) => {
    const submission = await context.repos.metaSubmissions.byCandidateDeckId(input.candidateDeckId);
    return { submission: submission === null ? null : toAdminMetaSubmission(submission) };
  }),

  resolve: os.resolve.handler(async ({ input, context }): Promise<void> => {
    const submission = await requireUnsettled(context.repos, input.id);

    await context.repos.metaSubmissions.resolve(input.id, {
      status: input.status,
      resolvedAt: new Date(),
      reason: input.reason,
      note: input.note,
      resolvedByUserId: context.userId,
      // Only an accept produces a deck, and this verb is every outcome but that
      // one, so there is never a deck to point at here.
      acceptedDeckId: null,
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-submission.resolve",
      entityType: "meta-submission",
      entityId: input.id,
      entityLabel: `${submission.playerName} — ${submission.eventName}`,
      oldValues: { status: submission.status },
      newValues: { status: input.status, reason: input.reason },
    });
  }),

  reopen: os.reopen.handler(async ({ input, context }): Promise<void> => {
    const submission = await requireUnsettled(context.repos, input.id);

    // Keeps whatever message the admin wrote: a reopened submission is one the
    // reviewer is looking at again, not one nothing was ever said about.
    await context.repos.metaSubmissions.reopen(input.id);

    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-submission.reopen",
      entityType: "meta-submission",
      entityId: input.id,
      entityLabel: `${submission.playerName} — ${submission.eventName}`,
      oldValues: { status: submission.status },
      newValues: { status: "pending" },
    });
  }),
};
