import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { keysetCursorSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { contributionCardSchema, contributionPrintingSchema } from "../contribute-schema.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * The candidate provider every in-app submission is ingested under (ADR-036).
 * Shared so the admin UI can tell a user-submission column from a scraped one
 * without restating the literal.
 */
export const USER_SUBMISSION_PROVIDER = "usersubmission";

/**
 * A user submission carries the same card/printing fields as the contribution
 * schema, minus `external_id` — the server generates a per-submission
 * external_id (`<slug>--<dateStamp>--<userId>`, ADR-036) so it never trusts the
 * client for the natural key.
 */
export const cardSubmissionCardSchema = contributionCardSchema.omit({ external_id: true });
export const cardSubmissionPrintingSchema = contributionPrintingSchema.omit({ external_id: true });

export const cardSubmissionSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, {
      message: "Slug must be lowercase letters, digits, and hyphens.",
    }),
    card: cardSubmissionCardSchema,
    // May be empty: the correction flow drops printings the contributor never
    // touched, so a card-level-only fix legitimately carries none.
    printings: z.array(cardSubmissionPrintingSchema).max(50),
    submissionNote: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  })
  .strict();

export const cardSubmissionResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi("CardSubmissionResponse");

// ── Submission status (migration 234) ────────────────────────────────────────

export const cardSubmissionKindSchema = z.enum(["new_card", "correction", "image"]);

/**
 * `already_correct` (the catalog already matched everything proposed) is kept
 * apart from `not_applied` (an admin reviewed it and took nothing) and
 * `rejected` (an admin rejected it outright). The contributor sees similar
 * wording for the last two, but only `rejected` is a signal about the user.
 */
export const cardSubmissionStatusSchema = z.enum([
  "pending",
  "accepted",
  "already_correct",
  "not_applied",
  "rejected",
]);

export const cardSubmissionReasonSchema = z.enum([
  "duplicate",
  "already_correct",
  "unverified",
  "not_a_card",
  "bad_image",
]);

export const cardSubmissionsQuerySchema = z.object({
  cursor: keysetCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const cardSubmissionStatusResponseSchema = z
  .object({
    id: z.string(),
    kind: cardSubmissionKindSchema,
    cardName: z.string(),
    /** Set once there is a card to link to, which for a new card means accepted. */
    cardSlug: z.string().nullable(),
    status: cardSubmissionStatusSchema,
    /** The contributor's own "where I spotted this" note. */
    note: z.string().nullable(),
    reason: cardSubmissionReasonSchema.nullable(),
    /** Free-text message from the admin, shown alongside the canned reason. */
    resolutionNote: z.string().nullable(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .openapi("CardSubmissionStatusResponse");

export const cardSubmissionListResponseSchema = z
  .object({
    items: z.array(cardSubmissionStatusResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CardSubmissionListResponse");

/**
 * oRPC contract for the in-app card-submission endpoints (ADR-036). Session-gated
 * (base carries UNAUTHORIZED). `TOO_MANY_REQUESTS` is the per-user daily cap;
 * `BAD_REQUEST` surfaces DB-constraint validation failures the client schema
 * didn't already catch. `list` is the contributor's own history, always scoped
 * to the session user, never to a user id from the client.
 */
export const cardSubmissionsContract = {
  submit: authedRoute
    .route({ method: "POST", path: "/api/v1/card-submissions", tags: ["Card Submissions"] })
    .errors({
      TOO_MANY_REQUESTS: { message: "Daily submission limit reached" },
      BAD_REQUEST: { message: "Submission failed validation" },
    })
    .input(cardSubmissionSchema)
    .output(cardSubmissionResponseSchema),
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/card-submissions", tags: ["Card Submissions"] })
    .input(cardSubmissionsQuerySchema)
    .output(cardSubmissionListResponseSchema),
};

export type CardSubmissionsContract = typeof cardSubmissionsContract;
export type CardSubmissionInput = z.infer<typeof cardSubmissionSchema>;
export type CardSubmissionKind = z.infer<typeof cardSubmissionKindSchema>;
export type CardSubmissionStatus = z.infer<typeof cardSubmissionStatusSchema>;
export type CardSubmissionReason = z.infer<typeof cardSubmissionReasonSchema>;
export type CardSubmissionStatusResponse = z.infer<typeof cardSubmissionStatusResponseSchema>;
export type CardSubmissionListResponse = z.infer<typeof cardSubmissionListResponseSchema>;
