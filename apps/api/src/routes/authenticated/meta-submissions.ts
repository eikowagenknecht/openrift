import { ERROR_CODES } from "@openrift/shared";
import { metaSubmissionsContract } from "@openrift/shared/contracts/meta-submissions";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { toMetaDeckSubmission } from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { orpcErrorResponse } from "../../orpc/error-body.js";
import { buildKeysetCursor } from "../../repositories/query-helpers.js";
import type { Variables } from "../../types.js";

/** A decklist is a few hundred short text lines, never a binary upload. */
const MAX_BODY_BYTES = 128 * 1024;

/** Page size when the client doesn't ask for one. */
const DEFAULT_LIST_LIMIT = 25;

const os = implement(metaSubmissionsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The meta archive's signed-in surfaces (ADR-014's User submissions and
 * Contributor credit, both ADR-036's design applied to a second entity).
 *
 * Auth is per procedure, through `requireAuthedUser`, and deliberately not a
 * Hono middleware on the `/api/v1/meta` prefix: the archive's reads live on that
 * same prefix and are anonymous, so a prefix gate would 401 every public page.
 *
 * Nothing here writes a live row. A submission stages one candidate deck and one
 * ledger row, and an admin accept is what makes any of it public.
 */
export const metaSubmissionsRouter = {
  submit: os.submit.handler(async ({ input, context, errors }) => {
    const result = await context.services.submitMetaDeck(context.transact, {
      userId: context.userId,
      metaEventId: input.metaEventId,
      proposedEvent: input.proposedEvent,
      playerName: input.playerName,
      finishTier: input.finishTier,
      record: input.record,
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

    // Unresolved names travel back rather than blocking the submission: an
    // unmatched spelling is usually an alias the catalog needs, which is the
    // admin's fix, and the contributor should still see which lines were odd.
    return { id: result.submissionId, unresolvedNames: result.unresolvedNames };
  }),

  list: os.list.handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIST_LIMIT;
    // The repo scopes by user id itself; the client never supplies one.
    const rows = await context.repos.metaSubmissions.listByUser(context.userId, {
      cursor: input.cursor ?? null,
      limit,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return {
      items: items.map((row) => toMetaDeckSubmission(row)),
      nextCursor: hasMore && last ? buildKeysetCursor(last.createdAt, last.id) : null,
    };
  }),

  creditVisibility: os.creditVisibility.handler(async ({ context }) => {
    const visibility = await context.repos.meta.creditVisibility(context.userId);
    // A session always names a real user, so an absent row means the account was
    // deleted mid-request. `hidden` is the safe answer either way.
    return { visibility: visibility ?? "hidden" };
  }),

  setCreditVisibility: os.setCreditVisibility.handler(async ({ input, context }) => {
    // Rows in `meta_credits` are untouched: consent is read at render, so
    // opting in credits every past contribution and opting out removes them
    // all, without rewriting a single archive row.
    await context.repos.meta.setCreditVisibility(context.userId, input.visibility);
    return { visibility: input.visibility };
  }),
};

/**
 * Registers the Hono body-limit that fronts the submission endpoint, mirroring
 * the card-submission guard. Runs before the oRPC catch-all so an oversized
 * payload is rejected early. The per-user cap on pending submissions is enforced
 * in the service (a DB-backed count under an advisory lock), not here.
 *
 * Scoped to the exact submission path, never to `/api/v1/meta/*`: the archive's
 * public reads share that prefix.
 *
 * @param app The Hono app to register middleware on.
 * @returns Nothing; registers middleware on the passed app.
 */
export function mountMetaSubmissionsMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use(
    "/api/v1/meta/submissions",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      // The limit rejects before the oRPC catch-all runs, so the body is built
      // here rather than thrown as an AppError — the client gets the same
      // envelope for the 413 as for this endpoint's other errors.
      onError: (c) =>
        orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Submission exceeds 128 KB"),
    }),
  );
}
