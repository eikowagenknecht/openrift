import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckCheckEntryCardResponseSchema,
  deckCheckEntryStateSchema,
  deckCheckReviewOutcomeSchema,
  deckViolationSchema,
} from "@openrift/shared/response-schemas";
import {
  deckCheckClaimTokenParamSchema,
  exactlyOneDeckCheckSubmissionSource,
  playerDeckCheckSubmissionShape,
} from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const deckCheckSubmissionTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

export const playerDeckCheckEntryParamSchema = z.object({
  entryId: z.uuid(),
});

const playerDeckCheckEntrySummaryResponseSchema = z.object({
  id: z.string(),
  eventName: z.string(),
  eventDate: z.string().nullable(),
  groupName: z.string().nullable(),
  groupSlug: z.string().nullable(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  unlockRequested: z.boolean(),
  playerMessage: z.string().nullable(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const playerDeckCheckEntriesResponseSchema = z
  .object({ items: z.array(playerDeckCheckEntrySummaryResponseSchema) })
  .openapi("PlayerDeckCheckEntriesResponse");

export const playerDeckCheckEntryDetailResponseSchema = z
  .object({
    entry: z.object({
      id: z.string(),
      eventName: z.string(),
      eventDate: z.string().nullable(),
      groupName: z.string().nullable(),
      format: z.string().nullable(),
      allowedSets: z.array(z.string()).nullable(),
      state: deckCheckEntryStateSchema,
      reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
      unlockRequested: z.boolean(),
      playerMessage: z.string().nullable(),
      allowDeckPublishing: z.boolean(),
      allowNameSharing: z.boolean(),
      allowRiotIdSharing: z.boolean(),
      submittedAt: z.string().nullable(),
      submissionsCloseAt: z.string().nullable(),
      updatedAt: z.string(),
      windowOpen: z.boolean(),
      canEdit: z.boolean(),
      canUnlock: z.boolean(),
      canRequestUnlock: z.boolean(),
    }),
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
    typeCounts: z.array(z.object({ cardType: z.string(), count: z.number().int().nonnegative() })),
    domainDistribution: z.array(
      z.object({ domain: z.string(), count: z.number().int().nonnegative() }),
    ),
  })
  .openapi("PlayerDeckCheckEntryDetailResponse");

export const deckCheckSubmissionPageResponseSchema = z
  .object({
    eventName: z.string(),
    eventDate: z.string().nullable(),
    groupName: z.string(),
    format: z.string().nullable(),
    allowedSets: z.array(z.string()).nullable(),
    submissionsCloseAt: z.string().nullable(),
    submissionsOpen: z.boolean(),
    linkedEntry: z
      .object({
        id: z.string(),
        state: deckCheckEntryStateSchema,
        canReplace: z.boolean(),
        allowDeckPublishing: z.boolean(),
        allowNameSharing: z.boolean(),
        allowRiotIdSharing: z.boolean(),
      })
      .nullable(),
  })
  .openapi("DeckCheckSubmissionPageResponse");

export const deckCheckSubmissionResultResponseSchema = z
  .object({
    entryId: z.string().nullable(),
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
  })
  .openapi("DeckCheckSubmissionResultResponse");

export const deckCheckClaimResultResponseSchema = z
  .object({
    status: z.enum(["claimed", "already", "conflict", "blocked", "duplicate"]),
    tournamentId: z.string().nullable(),
    entryId: z.string().nullable(),
  })
  .openapi("DeckCheckClaimResultResponse");

const TAG = "Deck Check";

const ONE_SOURCE_MESSAGE = "Provide exactly one of deckId, deckCode, or cards";

/**
 * oRPC contract for the player-facing deck-check surface (ADR-026/027),
 * mounted at `/api/v1/deck-check`. All require a session; the base carries
 * UNAUTHORIZED + FORBIDDEN. Domain codes per route: most carry NOT_FOUND
 * (missing entry, event, submission link, or account); mutation routes also
 * declare CONFLICT (locked or withdrawn state) and, where input is rejected,
 * VALIDATION_ERROR (422). The submission inputs merge the path token/entry id
 * with the submission body and re-apply the "exactly one deck source" rule.
 */
export const deckCheckPlayerContract = {
  listMine: authedRoute
    .route({ method: "GET", path: "/api/v1/deck-check/mine", tags: [TAG] })
    .output(playerDeckCheckEntriesResponseSchema),
  getMine: authedRoute
    .route({ method: "GET", path: "/api/v1/deck-check/mine/{entryId}", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Entry not found" } })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  editList: authedRoute
    .route({ method: "PUT", path: "/api/v1/deck-check/mine/{entryId}/list", tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Entry or deck not found" },
      CONFLICT: { message: "Submissions are closed or the deck is locked" },
      VALIDATION_ERROR: { status: 422, message: "Invalid deck section or deck code" },
    })
    .input(
      playerDeckCheckEntryParamSchema
        .extend(playerDeckCheckSubmissionShape)
        .refine(exactlyOneDeckCheckSubmissionSource, { message: ONE_SOURCE_MESSAGE }),
    )
    .output(deckCheckSubmissionResultResponseSchema),
  submit: authedRoute
    .route({ method: "POST", path: "/api/v1/deck-check/mine/{entryId}/submit", tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Entry not found" },
      CONFLICT: { message: "Submissions are closed or the deck is not editable" },
    })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  unlock: authedRoute
    .route({ method: "POST", path: "/api/v1/deck-check/mine/{entryId}/unlock", tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Entry not found" },
      CONFLICT: { message: "Submissions are closed or the deck cannot be unlocked" },
    })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  cancelUnlock: authedRoute
    .route({ method: "DELETE", path: "/api/v1/deck-check/mine/{entryId}/unlock", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Entry not found" } })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  submissionPage: authedRoute
    .route({ method: "GET", path: "/api/v1/deck-check/submissions/{token}", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Submission link not found" } })
    .input(deckCheckSubmissionTokenParamSchema)
    .output(deckCheckSubmissionPageResponseSchema),
  submitToToken: authedRoute
    .route({ method: "POST", path: "/api/v1/deck-check/submissions/{token}", tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Submission link or account not found" },
      CONFLICT: { message: "Submissions are closed or the entry is locked" },
      VALIDATION_ERROR: { status: 422, message: "Invalid deck section or deck code" },
    })
    .input(
      deckCheckSubmissionTokenParamSchema
        .extend(playerDeckCheckSubmissionShape)
        .refine(exactlyOneDeckCheckSubmissionSource, { message: ONE_SOURCE_MESSAGE }),
    )
    .output(deckCheckSubmissionResultResponseSchema),
  claim: authedRoute
    .route({ method: "POST", path: "/api/v1/deck-check/claim/{token}", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Claim link not found" } })
    .input(deckCheckClaimTokenParamSchema)
    .output(deckCheckClaimResultResponseSchema),
};

export type DeckCheckPlayerContract = typeof deckCheckPlayerContract;
