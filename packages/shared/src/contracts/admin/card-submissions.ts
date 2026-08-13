import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import {
  cardSubmissionKindSchema,
  cardSubmissionReasonSchema,
  cardSubmissionStatusSchema,
} from "../card-submissions.js";

const TAG = "Admin - Card Submissions";

const CS = "/api/admin/v1/card-submissions";

const adminSubmissionSchema = z.object({
  id: z.string(),
  kind: cardSubmissionKindSchema,
  status: cardSubmissionStatusSchema,
  cardName: z.string(),
  /** The contributor's own note, repeated here so the dialog needs one fetch. */
  note: z.string().nullable(),
  reason: cardSubmissionReasonSchema.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: isoDateTime.nullable(),
});

const resolutionInput = z.object({
  candidateCardId: z.string().min(1),
  /** Null clears the canned reason, leaving any free text in place. */
  reason: cardSubmissionReasonSchema.nullable(),
  note: z.string().trim().min(1).max(2000).nullable(),
});

/**
 * oRPC contract for the admin side of in-app card submissions (ADR-036, mounted
 * under `/api/admin/v1/card-submissions`, admin-gated by the mount).
 *
 * Only the contributor-visible message lives here. The outcome itself is never
 * set directly: it falls out of the check and ignore verbs the admin already
 * uses, so a status can't drift from what review actually did.
 */
export const adminCardSubmissionsContract = {
  forCandidate: authedRoute
    .route({ method: "GET", path: `${CS}/by-candidate/{candidateCardId}`, tags: [TAG] })
    .input(z.object({ candidateCardId: z.string().min(1) }))
    .output(z.object({ submission: adminSubmissionSchema.nullable() })),
  setResolution: authedRoute
    .route({ method: "POST", path: `${CS}/resolution`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Candidate is not a user submission" } })
    .input(resolutionInput),
};

export type AdminCardSubmissionsContract = typeof adminCardSubmissionsContract;
export type AdminCardSubmission = z.infer<typeof adminSubmissionSchema>;
