import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  metaSubmissionKindSchema,
  metaSubmissionReasonSchema,
  metaSubmissionStatusSchema,
} from "@openrift/shared/response-schemas";
import { idParamSchema, isoDate, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { metaEventFieldEditsSchema } from "../meta-submissions.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta submissions";
const BASE = "/api/admin/v1/meta/submissions";

/**
 * Submitter identity is deliberately absent here: the candidate row beside it
 * carries `submittedByUserId`/`submittedByName`.
 */
export const adminMetaSubmissionSchema = z
  .object({
    id: z.string(),
    eventName: z.string(),
    playerName: z.string().nullable(),
    kind: metaSubmissionKindSchema,
    note: z.string().nullable(),
    status: metaSubmissionStatusSchema,
    reason: metaSubmissionReasonSchema.nullable(),
    resolutionNote: z.string().nullable(),
    acceptedDeckId: z.string().nullable(),
    createdAt: isoDateTime,
    resolvedAt: isoDateTime.nullable(),
  })
  .openapi("AdminMetaSubmission");

/** Duplicated here so the queue can show each proposed value beside the one it replaces. */
const correctedMetaEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  eventDate: isoDate,
  format: z.string(),
  playerCount: z.number().int().nullable(),
  organizer: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
});

/**
 * A correction has no candidate row and no accept step; an admin edits the
 * event directly and stamps the outcome.
 */
export const adminMetaEventCorrectionSchema = z
  .object({
    submission: adminMetaSubmissionSchema,
    event: correctedMetaEventSchema.nullable(),
    fieldEdits: metaEventFieldEditsSchema,
  })
  .openapi("AdminMetaEventCorrection");

/**
 * `accepted` is written only by the accept transaction itself.
 * `already_correct` is an expected duplicate, not a rejection.
 */
export const metaSubmissionResolutionSchema = z.enum([
  "rejected",
  "already_correct",
  "not_applied",
]);

const resolveMetaSubmissionSchema = z.object({
  status: metaSubmissionResolutionSchema,
  reason: metaSubmissionReasonSchema.nullable().optional().default(null),
  note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

/**
 * A submission has no ignore path; the outcome is stamped explicitly.
 * Resolving does not remove the overlay, so {@link adminMetaSubmissionsContract.reopen} can restore it.
 */
export const adminMetaSubmissionsContract = {
  forPlayerOverlay: authedRoute
    .route({ method: "GET", path: `${BASE}/by-player-overlay/{playerOverlayId}`, tags: [TAG] })
    .input(z.object({ playerOverlayId: z.uuid() }))
    // Null, not a 404: a provider's overlay is not a submission.
    .output(z.object({ submission: adminMetaSubmissionSchema.nullable() })),

  eventCorrections: authedRoute
    .route({ method: "GET", path: `${BASE}/event-corrections`, tags: [TAG] })
    // Unresolved only. `hasMore` says the page was cut short, not truncated silently.
    .output(z.object({ items: z.array(adminMetaEventCorrectionSchema), hasMore: z.boolean() })),

  resolve: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/resolve`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, resolveMetaSubmissionSchema))
    .errors({
      NOT_FOUND: { message: "Submission not found" },
      CONFLICT: { message: "That submission was already accepted" },
    }),

  reopen: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/reopen`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Submission not found" },
      CONFLICT: { message: "That submission was already accepted" },
    }),
};

export type AdminMetaSubmissionsContract = typeof adminMetaSubmissionsContract;
export type AdminMetaSubmission = z.infer<typeof adminMetaSubmissionSchema>;
export type AdminMetaEventCorrection = z.infer<typeof adminMetaEventCorrectionSchema>;
export type MetaSubmissionResolution = z.infer<typeof metaSubmissionResolutionSchema>;
