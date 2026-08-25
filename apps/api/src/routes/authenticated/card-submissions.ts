import { ERROR_CODES } from "@openrift/shared";
import { cardSubmissionsContract } from "@openrift/shared/contracts/card-submissions";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { toCardSubmissionStatus } from "../../lib/card-submission-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { orpcErrorResponse } from "../../orpc/error-body.js";
import { keysetPage } from "../../repositories/query-helpers.js";
import {
  buildUserSubmissionCard,
  formatSubmissionDateStamp,
} from "../../services/ingest-user-submission.js";
import type { Variables } from "../../types.js";

/** A card submission is small text + image URLs, never a binary upload. */
const MAX_BODY_BYTES = 256 * 1024;

const DEFAULT_LIST_LIMIT = 25;

const os = implement(cardSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * oRPC implementation of the in-app card-submission endpoint. Requires a
 * signed-in user. Maps the submission to the candidate `IngestCard` shape with
 * server-generated external_ids, then ingests it under the `usersubmission`
 * provider. The per-user daily cap and DB-constraint validation happen inside
 * the service; this handler translates their outcomes into typed oRPC errors.
 */
export const cardSubmissionsRouter = {
  submit: os.submit.handler(async ({ input, context, errors }): Promise<{ ok: true }> => {
    const now = new Date();
    const dateStamp = formatSubmissionDateStamp(now);
    const card = buildUserSubmissionCard(input, context.userId, dateStamp);

    const result = await context.services.ingestUserSubmission(context.transact, {
      userId: context.userId,
      submissionNote: input.submissionNote ?? null,
      card,
      now,
    });

    if (result.status === "rate_limited") {
      throw errors.TOO_MANY_REQUESTS({
        message: `You can submit up to ${result.limit} cards per day. Please try again later.`,
      });
    }
    if (result.status === "invalid") {
      throw errors.BAD_REQUEST({ message: result.errors.join("; ") });
    }

    // Tells the admins who opted in that something is waiting for review,
    // after the candidate row has committed, outside any transaction, and
    // best-effort (the service swallows its own errors) so a mail failure can
    // never fail a submission the contributor already made.
    await context.services.notifyAdminsOfCardSubmission(context.repos, {
      submitterUserId: context.userId,
      card,
      note: input.submissionNote ?? null,
    });

    return { ok: true };
  }),

  list: os.list.handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIST_LIMIT;
    // The repo scopes by user id itself; the client never supplies one.
    const rows = await context.repos.cardSubmissions.listByUser(context.userId, {
      cursor: input.cursor ?? null,
      limit,
    });

    return keysetPage(rows, limit, toCardSubmissionStatus);
  }),
};

/**
 * Registers the Hono body-limit that fronts the card-submission endpoint,
 * mirroring the deck-check ingest guard. Runs before the oRPC catch-all so an
 * oversized payload is rejected early. The per-user rate limit is enforced in
 * the service (a DB-backed daily cap), not here.
 */
export function mountCardSubmissionsMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use(
    "/api/v1/card-submissions",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      // The limit rejects before the oRPC catch-all runs, so the body is built
      // here rather than thrown as an AppError — the client gets the same
      // envelope for the 413 as for this endpoint's other errors.
      onError: (c) =>
        orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Submission exceeds 256 KB"),
    }),
  );
}
