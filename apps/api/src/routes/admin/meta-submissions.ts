import { adminMetaSubmissionsContract } from "@openrift/shared/contracts/admin/meta-submissions";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { toAdminMetaEventCorrection, toAdminMetaSubmission } from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { MetaSubmissionRow } from "../../repositories/meta-submissions.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";

const os = implement(adminMetaSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

const EVENT_CORRECTION_LIMIT = 200;

/**
 * An accepted submission is settled with the contributor's credit and the archived deck.
 * Only `unlink` may reverse it; it also removes the credit.
 */
async function requireUnsettled(
  repos: ApiContext["repos"],
  id: string,
): Promise<MetaSubmissionRow> {
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
 * Admin side of meta decklist submissions.
 *
 * A submission carries no source-event key, so its outcome cannot be derived
 * from check/ignore verbs the way the card pipeline does; the verb is explicit here.
 * Resolving does not delete the overlay: {@link adminMetaSubmissionsRouter.reopen} reverses it.
 */
export const adminMetaSubmissionsRouter = {
  forPlayerOverlay: os.forPlayerOverlay.handler(async ({ input, context }) => {
    const submission = await context.repos.metaSubmissions.byPlayerOverlayId(input.playerOverlayId);
    return { submission: submission === null ? null : toAdminMetaSubmission(submission) };
  }),

  eventCorrections: os.eventCorrections.handler(async ({ context }) => {
    // One past the cap, so a full page is told apart from a page that ran out.
    const rows = await context.repos.metaSubmissions.listPendingEventCorrections(
      EVENT_CORRECTION_LIMIT + 1,
    );
    const hasMore = rows.length > EVENT_CORRECTION_LIMIT;
    const page = hasMore ? rows.slice(0, EVENT_CORRECTION_LIMIT) : rows;
    return { items: page.map((row) => toAdminMetaEventCorrection(row)), hasMore };
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
      entityLabel: `${submission.playerName ?? "Event correction"} — ${submission.eventName}`,
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
      entityLabel: `${submission.playerName ?? "Event correction"} — ${submission.eventName}`,
      oldValues: { status: submission.status },
      newValues: { status: "pending" },
    });
  }),
};
