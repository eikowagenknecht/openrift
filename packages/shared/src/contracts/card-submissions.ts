import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { keysetCursorSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { contributionCardSchema, contributionPrintingSchema } from "../contribute-schema.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/** The candidate provider every in-app submission is ingested under. */
export const USER_SUBMISSION_PROVIDER = "usersubmission";

/** The server generates `external_id` (`<slug>--<dateStamp>--<userId>`); it never trusts the client for it. */
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

export const cardSubmissionKindSchema = z.enum(["new_card", "correction", "image"]);

/** `not_applied` and `rejected` read similarly to the contributor, but only `rejected` is a signal about the user. */
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

export const cardSubmissionImageUploadResponseSchema = z
  .object({ url: z.string() })
  .openapi("CardSubmissionImageUploadResponse");

export const missingImagePrintingSchema = z
  .object({
    printingId: z.string(),
    cardSlug: z.string(),
    cardName: z.string(),
    setSlug: z.string(),
    setName: z.string(),
    publicCode: z.string(),
    finish: z.string(),
    language: z.string(),
    copies: z.number().int(),
  })
  .openapi("MissingImagePrinting");

export const missingImagesResponseSchema = z
  .object({ items: z.array(missingImagePrintingSchema) })
  .openapi("MissingImagesResponse");

/** Always scoped to the session user, never a user id from the client; `uploadImage` reads its `File` from the multipart body. */
export const cardSubmissionsContract = {
  uploadImage: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/card-submissions/images",
      tags: ["Card Submissions"],
    })
    .errors({
      PAYLOAD_TOO_LARGE: { message: "File exceeds 20 MB limit" },
      BAD_REQUEST: { message: "File is not an image" },
      TOO_MANY_REQUESTS: { message: "Daily upload limit reached" },
    })
    .input(z.object({ file: z.instanceof(File) }))
    .output(cardSubmissionImageUploadResponseSchema),
  missingImages: authedRoute
    .route({
      method: "GET",
      path: "/api/v1/card-submissions/missing-images",
      tags: ["Card Submissions"],
    })
    .output(missingImagesResponseSchema),
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
export type MissingImagePrinting = z.infer<typeof missingImagePrintingSchema>;
export type MissingImagesResponse = z.infer<typeof missingImagesResponseSchema>;
