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
import { saveSubmissionUpload } from "../services/submission-uploads.js";

const MAX_BODY_BYTES = 256 * 1024;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const DEFAULT_LIST_LIMIT = 25;

const os = implement(cardSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

export const cardSubmissionsRouter = {
  uploadImage: os.uploadImage.handler(async ({ input, context, errors }) => {
    if (input.file.size > MAX_UPLOAD_BYTES) {
      throw errors.PAYLOAD_TOO_LARGE();
    }

    const result = await saveSubmissionUpload(context.io, {
      userId: context.userId,
      buffer: Buffer.from(await input.file.arrayBuffer()),
      now: new Date(),
    });

    if (result.status === "rate_limited") {
      throw errors.TOO_MANY_REQUESTS({
        message: `You can upload up to ${result.limit} photos per day. Please try again later.`,
      });
    }
    if (result.status === "not_an_image") {
      throw errors.BAD_REQUEST();
    }

    return { url: result.url };
  }),

  missingImages: os.missingImages.handler(async ({ context }) => {
    const items = await context.repos.cardSubmissions.missingImagesForUser(context.userId);
    return { items };
  }),

  summary: os.summary.handler(({ context }) =>
    context.repos.cardSubmissions.summaryForUser(context.userId),
  ),

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

// Hono matches a `use` path exactly, so the upload path needs its own body limit.
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
  app.use(
    "/api/v1/card-submissions/images",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "File exceeds 20 MB"),
    }),
  );
}
