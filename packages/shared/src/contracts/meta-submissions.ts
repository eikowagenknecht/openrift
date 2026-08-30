import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  metaCreditVisibilitySchema,
  metaListStatusSchema,
  metaSubmissionKindSchema,
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
 * The kinds a decklist submission can be. `event_correction` is excluded: it
 * carries no list and no player, so it travels through its own procedure.
 */
const metaDeckSubmissionKindSchema = metaSubmissionKindSchema.exclude(["event_correction"]);

/**
 * One decklist submitted against an event the archive already has, or against
 * one it does not. Exactly one of `metaEventId` and `proposedEvent` is set: a
 * submission targets one event, and `candidate_meta_players` has a CHECK for
 * precisely that.
 *
 * A submission always carries a list — that is what a contributor has to give —
 * so `listStatus` never says `"none"`. Standings-only rows come from the
 * archive's own sources, not from people.
 */
export const metaSubmissionInputSchema = z
  .object({
    metaEventId: z.uuid().nullable().optional().default(null),
    /**
     * What this asks for. Advisory: an accept writes the same archive row
     * whichever it is, and the reviewer reads it to know what they are being
     * asked to compare against.
     */
    kind: metaDeckSubmissionKindSchema.optional().default("new_list"),
    proposedEvent: metaSubmissionProposedEventSchema.nullable().optional().default(null),
    playerName: z.string().trim().min(1).max(80),
    rank: z.number().int().min(1),
    /** True when `rank` is a cut bucket ("T8") rather than an exact standing. */
    rankIsTier: z.boolean().optional().default(false),
    wins: z.number().int().min(0).nullable().optional().default(null),
    losses: z.number().int().min(0).nullable().optional().default(null),
    draws: z.number().int().min(0).nullable().optional().default(null),
    /** `"partial"` when the main deck is complete but the side zones are not. */
    listStatus: metaListStatusSchema.exclude(["none"]).optional().default("full"),
    cards: z.array(metaSubmissionCardSchema).min(1).max(200),
    note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  })
  .refine((input) => (input.metaEventId === null) !== (input.proposedEvent === null), {
    message: "Submit against an existing event or propose one, not both and not neither",
  });

/**
 * The event facts a reader can propose a new value for, all optional: a key is
 * present exactly when the submitter typed something into that box.
 *
 * Only setting a value is expressible, never clearing one. "The archive lists an
 * organizer and there wasn't one" is rare enough to belong in the note, and a
 * tri-state box in front of a reader who spotted a wrong date is worse than the
 * fact it would capture.
 */
export const metaEventFieldEditsSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    eventDate: isoDate.optional(),
    format: z.string().trim().min(1).max(60).optional(),
    playerCount: z.number().int().positive().max(1_000_000).optional(),
    organizer: z.string().trim().min(1).max(120).optional(),
    /** The venue address, as the submitter would have it read. */
    location: z.string().trim().min(1).max(200).optional(),
    /** ISO 3166-1 alpha-2. */
    country: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/u)
      .optional(),
  })
  .openapi("MetaEventFieldEdits");

/**
 * A correction to an archived event's own facts, rather than to a decklist.
 *
 * It stages nothing: there is no candidate row to hang it off, and no accept
 * that could apply it, so this is a message with structured edits attached that
 * an admin applies by hand. The note is always required — a bare set of new
 * values with no word about where they came from is not something a reviewer can
 * act on.
 */
export const metaEventCorrectionInputSchema = z.object({
  metaEventId: z.uuid(),
  fieldEdits: metaEventFieldEditsSchema.optional().default({}),
  note: z.string().trim().min(1).max(2000),
});

export const metaSubmissionResultSchema = z
  .object({
    id: z.string(),
    /**
     * Card names that matched nothing. The submission is still staged: an
     * unmatched name is usually a spelling the catalog needs an alias for,
     * which is the admin's fix, not a reason to refuse the contribution.
     */
    unresolvedNames: z.array(z.string()),
  })
  .openapi("MetaSubmissionResult");

/**
 * One row of the contributor's own submission history. The candidate id and the
 * provider key stay off the wire: they are staging details, and staging is
 * disposable while this ledger is not.
 */
export const metaSubmissionSchema = z
  .object({
    id: z.string(),
    /** What the submitter called the event, so a row still reads without a target. */
    eventName: z.string(),
    /** Null on an event correction, which names no player. */
    playerName: z.string().nullable(),
    /** What this asked for, so the ledger row says which of the three it was. */
    kind: metaSubmissionKindSchema,
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
  .openapi("MetaSubmission");

export const metaSubmissionListResponseSchema = z
  .object({
    items: z.array(metaSubmissionSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("MetaSubmissionListResponse");

export const metaSubmissionsQuerySchema = z.object({
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
 * `submit` stages one candidate player and one ledger row in a single
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
    .input(metaSubmissionInputSchema)
    .output(metaSubmissionResultSchema),

  submitEventCorrection: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/submissions/event-corrections`,
      tags: [TAG],
      successStatus: 201,
    })
    .errors({
      TOO_MANY_REQUESTS: { message: "Too many submissions awaiting review" },
      NOT_FOUND: { message: "Event not found" },
    })
    .input(metaEventCorrectionInputSchema)
    .output(z.object({ id: z.string() })),

  list: authedRoute
    .route({ method: "GET", path: `${BASE}/submissions`, tags: [TAG] })
    .input(metaSubmissionsQuerySchema)
    .output(metaSubmissionListResponseSchema),

  creditVisibility: authedRoute
    .route({ method: "GET", path: `${BASE}/credit-visibility`, tags: [TAG] })
    .output(metaCreditVisibilityResponseSchema),

  setCreditVisibility: authedRoute
    .route({ method: "PATCH", path: `${BASE}/credit-visibility`, tags: [TAG] })
    .input(updateMetaCreditVisibilitySchema)
    .output(metaCreditVisibilityResponseSchema),
};

export type MetaSubmissionsContract = typeof metaSubmissionsContract;
