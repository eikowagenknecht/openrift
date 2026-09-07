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

export const META_USER_SUBMISSION_PROVIDER = "usersubmission";

/** Names, not ids: the server resolves them through the same alias index provider uploads use. */
export const metaSubmissionCardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  zone: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export const metaSubmissionProposedEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventDate: isoDate,
  format: z.string().trim().min(1),
  playerCount: z.number().int().positive().nullable().optional().default(null),
  organizer: z.string().trim().min(1).max(120).nullable().optional().default(null),
  sourceUrl: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

/** event_correction carries no list and no player; it travels through its own procedure. */
const metaDeckSubmissionKindSchema = metaSubmissionKindSchema.exclude(["event_correction"]);

/**
 * Exactly one of `metaEventId` and `proposedEvent` is set; `candidate_meta_players`
 * has a CHECK for precisely that.
 */
export const metaSubmissionInputSchema = z
  .object({
    metaEventId: z.uuid().nullable().optional().default(null),
    kind: metaDeckSubmissionKindSchema.optional().default("new_list"),
    proposedEvent: metaSubmissionProposedEventSchema.nullable().optional().default(null),
    playerName: z.string().trim().min(1).max(80),
    rank: z.number().int().min(1),
    rankIsTier: z.boolean().optional().default(false),
    wins: z.number().int().min(0).nullable().optional().default(null),
    losses: z.number().int().min(0).nullable().optional().default(null),
    draws: z.number().int().min(0).nullable().optional().default(null),
    listStatus: metaListStatusSchema.exclude(["none"]).optional().default("full"),
    cards: z.array(metaSubmissionCardSchema).min(1).max(200),
    note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  })
  .refine((input) => (input.metaEventId === null) !== (input.proposedEvent === null), {
    message: "Submit against an existing event or propose one, not both and not neither",
  });

/** All fields are set-only: there is no way to clear a value once submitted. */
export const metaEventFieldEditsSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    eventDate: isoDate.optional(),
    format: z.string().trim().min(1).max(60).optional(),
    playerCount: z.number().int().positive().max(1_000_000).optional(),
    organizer: z.string().trim().min(1).max(120).optional(),
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

/** Stages nothing: there's no candidate row and no accept path, an admin applies these edits by hand. */
export const metaEventCorrectionInputSchema = z.object({
  metaEventId: z.uuid(),
  fieldEdits: metaEventFieldEditsSchema.optional().default({}),
  note: z.string().trim().min(1).max(2000),
});

export const metaSubmissionResultSchema = z
  .object({
    id: z.string(),
    unresolvedNames: z.array(z.string()),
  })
  .openapi("MetaSubmissionResult");

// Candidate id and provider key are intentionally left off the wire.
export const metaSubmissionSchema = z
  .object({
    id: z.string(),
    eventName: z.string(),
    playerName: z.string().nullable(),
    kind: metaSubmissionKindSchema,
    note: z.string().nullable(),
    status: metaSubmissionStatusSchema,
    resolutionReason: metaSubmissionReasonSchema.nullable(),
    resolutionNote: z.string().nullable(),
    acceptedDeckToken: z.string().nullable(),
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
 * Credit rows are always written. This filters the public read: toggling it
 * retroactively credits or hides every past contribution.
 */
export const metaCreditVisibilityResponseSchema = z
  .object({ visibility: metaCreditVisibilitySchema })
  .openapi("MetaCreditVisibilityResponse");

export const updateMetaCreditVisibilitySchema = z.object({
  visibility: metaCreditVisibilitySchema,
});

/**
 * Session-gated per procedure, never via middleware on the prefix, since
 * `/api/v1/meta` also serves the public `metaContract` reads.
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
