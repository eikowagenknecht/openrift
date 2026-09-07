import { cardSubmissionsContract } from "@openrift/shared/contracts/card-submissions";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { formatCompactUtcStamp } from "@openrift/shared/format-date";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { keysetPage } from "../../../lib/keyset-cursor.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { orpcErrorResponse } from "../../../orpc/error-body.js";
import type { Variables } from "../../../types.js";
import { toCardSubmissionStatus } from "../lib/card-submission-presenters.js";
import { buildUserSubmissionCard } from "../services/ingest-user-submission.js";

const MAX_BODY_BYTES = 256 * 1024;

const DEFAULT_LIST_LIMIT = 25;

const os = implement(cardSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

export const cardSubmissionsRouter = {
  submit: os.submit.handler(async ({ input, context, errors }): Promise<{ ok: true }> => {
    const now = new Date();
    const dateStamp = formatCompactUtcStamp(now);
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

    // Runs after commit, outside any transaction; the service swallows its own
    // errors so a mail failure never fails an already-committed submission.
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

/** The per-user rate limit is a DB-backed daily cap enforced in the service, not here. */
export function mountCardSubmissionsMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use(
    "/api/v1/card-submissions",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      // Rejects before the oRPC catch-all runs, so the body is built here rather
      // than thrown as an AppError, keeping the 413 envelope shape consistent.
      onError: (c) =>
        orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Submission exceeds 256 KB"),
    }),
  );
}
