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
 * One submission as the reviewing admin sees it: the contributor's own claim
 * plus whatever outcome it already carries.
 *
 * The submitter's identity is deliberately absent — the candidate row beside it
 * carries `submittedByUserId` and `submittedByName`, and this row is about what
 * the archive told them.
 */
export const adminMetaSubmissionSchema = z
  .object({
    id: z.string(),
    /** What the submitter called the event, so the row reads without a target. */
    eventName: z.string(),
    /** Null on an event correction, which names no player. */
    playerName: z.string().nullable(),
    /** What the contributor is asking for, so the reviewer knows what to compare against. */
    kind: metaSubmissionKindSchema,
    /** The contributor's own note, repeated here so the dialog needs one fetch. */
    note: z.string().nullable(),
    status: metaSubmissionStatusSchema,
    reason: metaSubmissionReasonSchema.nullable(),
    resolutionNote: z.string().nullable(),
    /** Set once an accept produced an archived deck. */
    acceptedDeckId: z.string().nullable(),
    createdAt: isoDateTime,
    resolvedAt: isoDateTime.nullable(),
  })
  .openapi("AdminMetaSubmission");

/**
 * The event's own facts as they stand, so the queue can put each proposed value
 * beside the one it would replace without a second fetch per row.
 */
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
 * One proposed correction to an archived event's facts, with the event it is
 * about. Unlike a decklist submission there is no candidate row behind it and
 * no accept that applies it: an admin reads the note, edits the event, and
 * stamps the outcome.
 */
export const adminMetaEventCorrectionSchema = z
  .object({
    submission: adminMetaSubmissionSchema,
    /** Null when the event was deleted after the correction was sent. */
    event: correctedMetaEventSchema.nullable(),
    /** The proposed new values, keyed as the event's own fields. */
    fieldEdits: metaEventFieldEditsSchema,
  })
  .openapi("AdminMetaEventCorrection");

/**
 * The outcomes an admin stamps by hand. `accepted` is not among them: it is
 * written by the accept itself, in the same transaction as the contributor's
 * credit, so the ledger can never claim an acceptance the archive did not make.
 *
 * `already_correct` is the ADR's expected outcome for the second person to send
 * a list the archive already has — a real result, not a rejection, which is why
 * it is kept apart from `not_applied` (reviewed and nothing taken) and
 * `rejected` (turned down, the one that is a signal about the submission).
 */
export const metaSubmissionResolutionSchema = z.enum([
  "rejected",
  "already_correct",
  "not_applied",
]);

const resolveMetaSubmissionSchema = z.object({
  status: metaSubmissionResolutionSchema,
  /** The canned reason the contributor sees. Null leaves it unsaid. */
  reason: metaSubmissionReasonSchema.nullable().optional().default(null),
  /** Free text shown alongside the canned reason. */
  note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

/**
 * oRPC contract for the admin side of meta decklist submissions (ADR-014's
 * User submissions, which is ADR-036's design applied to a second entity),
 * mounted under `/api/admin/v1/meta/submissions` and admin-gated by the
 * `/api/admin/v1/*` mount.
 *
 * Unlike the card pipeline, where an outcome is derived from the check and
 * ignore verbs, a meta submission has no ignore path to derive from: its
 * candidate row hangs off a live event and carries no
 * `(provider, event external id, external id)` triple for the ignore list. So
 * the outcome is stamped explicitly here. Without it a submission could only
 * ever reach `accepted`, and a contributor whose list was turned down would
 * read "pending" forever.
 *
 * Resolving leaves the overlay in place on purpose, so
 * {@link adminMetaSubmissionsContract.reopen} can genuinely undo a misclick
 * rather than apologising for a deleted decklist.
 *
 * Domain codes: both writes → NOT_FOUND, plus CONFLICT on an accepted
 * submission — that one is settled by the accept itself, alongside a public
 * credit and a live deck, and overwriting it here would leave the three
 * disagreeing.
 */
export const adminMetaSubmissionsContract = {
  forPlayerOverlay: authedRoute
    .route({ method: "GET", path: `${BASE}/by-player-overlay/{playerOverlayId}`, tags: [TAG] })
    .input(z.object({ playerOverlayId: z.uuid() }))
    // Null rather than a 404: a provider's overlay is simply not a submission,
    // which the review screen asks about for every row it renders.
    .output(z.object({ submission: adminMetaSubmissionSchema.nullable() })),

  eventCorrections: authedRoute
    .route({ method: "GET", path: `${BASE}/event-corrections`, tags: [TAG] })
    // Unresolved only: a settled correction has been read and acted on, and the
    // queue is the list of what has not been. `hasMore` says the page was cut
    // short, so a burst is visible as one rather than silently truncated.
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
