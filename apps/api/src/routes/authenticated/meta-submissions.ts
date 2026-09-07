import { ERROR_CODES } from "@openrift/shared";
import { metaSubmissionsContract } from "@openrift/shared/contracts/meta-submissions";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { keysetPage } from "../../lib/keyset-cursor.js";
import { toMetaSubmission } from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { orpcErrorResponse } from "../../orpc/error-body.js";
import type { Variables } from "../../types.js";

const MAX_BODY_BYTES = 128 * 1024;

const DEFAULT_LIST_LIMIT = 25;

const os = implement(metaSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Auth is per procedure via `requireAuthedUser`, not Hono middleware on the
 * `/api/v1/meta` prefix: that prefix also serves anonymous archive reads.
 */
export const metaSubmissionsRouter = {
  submit: os.submit.handler(async ({ input, context, errors }) => {
    const result = await context.services.submitMetaDeck(context.transact, {
      userId: context.userId,
      metaEventId: input.metaEventId,
      proposedEvent: input.proposedEvent,
      kind: input.kind,
      playerName: input.playerName,
      rank: input.rank,
      rankIsTier: input.rankIsTier,
      wins: input.wins,
      losses: input.losses,
      draws: input.draws,
      listStatus: input.listStatus,
      cards: input.cards,
      note: input.note,
      now: new Date(),
    });

    if (result.status === "rate_limited") {
      throw errors.TOO_MANY_REQUESTS({
        message: `You already have ${result.limit} submissions awaiting review. Please wait until they are looked at.`,
      });
    }
    if (result.status === "invalid") {
      throw errors.BAD_REQUEST({ message: result.errors.join("; ") });
    }

    return { id: result.submissionId, unresolvedNames: result.unresolvedNames };
  }),

  submitEventCorrection: os.submitEventCorrection.handler(async ({ input, context, errors }) => {
    const result = await context.services.submitMetaEventCorrection(context.transact, {
      userId: context.userId,
      metaEventId: input.metaEventId,
      fieldEdits: input.fieldEdits,
      note: input.note,
      now: new Date(),
    });

    if (result.status === "rate_limited") {
      throw errors.TOO_MANY_REQUESTS({
        message: `You already have ${result.limit} submissions awaiting review. Please wait until they are looked at.`,
      });
    }
    return { id: result.submissionId };
  }),

  list: os.list.handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIST_LIMIT;
    const rows = await context.repos.metaSubmissions.listByUser(context.userId, {
      cursor: input.cursor ?? null,
      limit,
    });

    const tokens = await context.repos.metaSubmissions.shareTokensForDecks(
      rows.map((row) => row.acceptedDeckId).filter((id) => id !== null),
    );

    return keysetPage(rows, limit, (row) =>
      toMetaSubmission(
        row,
        row.acceptedDeckId === null ? null : (tokens.get(row.acceptedDeckId) ?? null),
      ),
    );
  }),

  creditVisibility: os.creditVisibility.handler(async ({ context }) => {
    const visibility = await context.repos.meta.creditVisibility(context.userId);
    return { visibility: visibility ?? "hidden" };
  }),

  setCreditVisibility: os.setCreditVisibility.handler(async ({ input, context }) => {
    // Rows in `meta_credits` are left untouched; consent is read at render time.
    await context.repos.meta.setCreditVisibility(context.userId, input.visibility);
    return { visibility: input.visibility };
  }),
};

/** Scoped to the exact submission paths; `/api/v1/meta/*` also serves anonymous reads. */
export function mountMetaSubmissionsMiddleware(app: Hono<{ Variables: Variables }>): void {
  const guard = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    // Runs before the oRPC catch-all, so the 413 body is built by hand here
    // to match the envelope shape oRPC errors use.
    onError: (c) =>
      orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Submission exceeds 128 KB"),
  });
  app.use("/api/v1/meta/submissions", guard);
  app.use("/api/v1/meta/submissions/event-corrections", guard);
}
