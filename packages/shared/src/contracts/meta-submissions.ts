import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  metaCreditVisibilitySchema,
  metaListStatusSchema,
  metaSubmissionReasonSchema,
  metaSubmissionStatusSchema,
} from "@openrift/shared/response-schemas";
import { isoDate, keysetCursorSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const TAG = "Meta submissions";
const BASE = "/api/v1/meta";

/**
 * The candidate provider every user submission is staged under (ADR-036),
 * shared with the card pipeline's `USER_SUBMISSION_PROVIDER` because it is the
 * same reserved string. Exported so the admin surfaces can tell a submitted
 * source column from a scraped one without restating the literal.
 */
export const META_USER_SUBMISSION_PROVIDER = "usersubmission";

/**
 * One card line as the submitter wrote it. Names, not ids: the server resolves
 * them through the same alias index the provider uploads use, so a spelling the
 * catalog already knows links exactly as a scrape of the same list would.
 */
export const metaSubmissionCardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  zone: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

/**
 * The event a submission proposes when the archive does not have it yet. It
 * becomes a candidate event under the submission provider — a proposal in the
 * review queue like any other, not a placeholder.
 */
export const metaSubmissionProposedEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventDate: isoDate,
  format: z.string().trim().min(1),
  playerCount: z.number().int().positive().nullable().optional().default(null),
  organizer: z.string().trim().min(1).max(120).nullable().optional().default(null),
  /** Where the submitter saw the results; becomes this candidate's citation if it is linked. */
  sourceUrl: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

/**
 * One decklist submitted against an event the archive already has, or against
 * one it does not. Exactly one of `metaEventId` and `proposedEvent` is set: a
 * submission targets one event, and `candidate_meta_decks` has a CHECK for
 * precisely that.
 */
export const metaDeckSubmissionInputSchema = z
  .object({
    metaEventId: z.uuid().nullable().optional().default(null),
    proposedEvent: metaSubmissionProposedEventSchema.nullable().optional().default(null),
    playerName: z.string().trim().min(1).max(80),
    finishTier: z.number().int().min(1),
    record: z.string().trim().min(1).max(20).nullable().optional().default(null),
    /** How much of the list this is; an archetype needs its legend to resolve. */
    listStatus: metaListStatusSchema.optional().default("full"),
    cards: z.array(metaSubmissionCardSchema).min(1).max(200),
    note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  })
  .refine((input) => (input.metaEventId === null) !== (input.proposedEvent === null), {
    message: "Submit against an existing event or propose one, not both and not neither",
  });

export const metaDeckSubmissionResultSchema = z
  .object({
    id: z.string(),
    /**
     * Card names that matched nothing. The submission is still staged: an
     * unmatched name is usually a spelling the catalog needs an alias for,
     * which is the admin's fix, not a reason to refuse the contribution.
     */
    unresolvedNames: z.array(z.string()),
  })
  .openapi("MetaDeckSubmissionResult");

/**
 * One row of the contributor's own submission history. The candidate id and the
 * provider key stay off the wire: they are staging details, and staging is
 * disposable while this ledger is not.
 */
export const metaDeckSubmissionSchema = z
  .object({
    id: z.string(),
    /** What the submitter called the event, so a row still reads without a target. */
    eventName: z.string(),
    playerName: z.string(),
    /** The contributor's own note. */
    note: z.string().nullable(),
    status: metaSubmissionStatusSchema,
    resolutionReason: metaSubmissionReasonSchema.nullable(),
    /** Free-text message from the admin, shown alongside the canned reason. */
    resolutionNote: z.string().nullable(),
    /** Set once an accept produced an archived deck. */
    acceptedDeckId: z.string().nullable(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .openapi("MetaDeckSubmission");

export const metaDeckSubmissionListResponseSchema = z
  .object({
    items: z.array(metaDeckSubmissionSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("MetaDeckSubmissionListResponse");

export const metaDeckSubmissionsQuerySchema = z.object({
  cursor: keysetCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Whether the caller's name appears on the archive pages they contributed to.
 * Credit rows are always written; this is what the public read filters on, so
 * opting in later credits every past contribution and opting out removes them
 * all without touching an archive row (ADR-014).
 */
export const metaCreditVisibilityResponseSchema = z
  .object({ visibility: metaCreditVisibilitySchema })
  .openapi("MetaCreditVisibilityResponse");

export const updateMetaCreditVisibilitySchema = z.object({
  visibility: metaCreditVisibilitySchema,
});

/**
 * oRPC contract for the meta archive's signed-in surfaces (ADR-014's User
 * submissions and Contributor credit, both ADR-036's design applied to a second
 * entity). Session-gated, so it sits apart from the anonymous `metaContract`
 * even though it shares the `/api/v1/meta` prefix — auth is per procedure here,
 * never a middleware on the prefix, which would 401 the public reads.
 *
 * `submit` stages one candidate deck and one ledger row in a single
 * transaction; nothing it writes is public until an admin accepts it.
 * `TOO_MANY_REQUESTS` is the per-user pending cap (a review of a whole decklist
 * is the cost being bounded, so the queue clears itself as the archive catches
 * up), `BAD_REQUEST` carries the validation problems the wire schema could not
 * know, and `NOT_FOUND` means the targeted event is gone.
 *
 * `list` is the contributor's own history, always scoped to the session user
 * and never to a user id from the client.
 */
export const metaSubmissionsContract = {
  submit: authedRoute
    .route({ method: "POST", path: `${BASE}/submissions`, tags: [TAG], successStatus: 201 })
    .errors({
      TOO_MANY_REQUESTS: { message: "Too many submissions awaiting review" },
      BAD_REQUEST: { message: "Submission failed validation" },
      NOT_FOUND: { message: "Event not found" },
    })
    .input(metaDeckSubmissionInputSchema)
    .output(metaDeckSubmissionResultSchema),

  list: authedRoute
    .route({ method: "GET", path: `${BASE}/submissions`, tags: [TAG] })
    .input(metaDeckSubmissionsQuerySchema)
    .output(metaDeckSubmissionListResponseSchema),

  creditVisibility: authedRoute
    .route({ method: "GET", path: `${BASE}/credit-visibility`, tags: [TAG] })
    .output(metaCreditVisibilityResponseSchema),

  setCreditVisibility: authedRoute
    .route({ method: "PATCH", path: `${BASE}/credit-visibility`, tags: [TAG] })
    .input(updateMetaCreditVisibilitySchema)
    .output(metaCreditVisibilityResponseSchema),
};

export type MetaSubmissionsContract = typeof metaSubmissionsContract;
