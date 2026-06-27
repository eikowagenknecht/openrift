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
import { oc } from "@orpc/contract";
import { z } from "zod";

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
  groupName: z.string(),
  groupSlug: z.string(),
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
      groupName: z.string(),
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
    status: z.enum(["claimed", "already", "conflict", "blocked"]),
    entryId: z.string().nullable(),
  })
  .openapi("DeckCheckClaimResultResponse");

const TAG = "Deck Check";

const ONE_SOURCE_MESSAGE = "Provide exactly one of deckId, deckCode, or cards";

/**
 * oRPC contract for the player-facing deck-check surface (ADR-026/027),
 * mounted at `/api/v1/deck-check`. All require a session. Not-found / conflict /
 * validation states are thrown as `AppError` and bridged to ORPCErrors in the
 * implementation, so the contract declares no per-code typed errors. The
 * submission inputs merge the path token/entry id with the submission body and
 * re-apply the "exactly one deck source" rule.
 */
export const deckCheckPlayerContract = {
  listMine: oc
    .route({ method: "GET", path: "/api/v1/deck-check/mine", tags: [TAG] })
    .output(playerDeckCheckEntriesResponseSchema),
  getMine: oc
    .route({ method: "GET", path: "/api/v1/deck-check/mine/{entryId}", tags: [TAG] })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  editList: oc
    .route({ method: "PUT", path: "/api/v1/deck-check/mine/{entryId}/list", tags: [TAG] })
    .input(
      playerDeckCheckEntryParamSchema
        .extend(playerDeckCheckSubmissionShape)
        .refine(exactlyOneDeckCheckSubmissionSource, { message: ONE_SOURCE_MESSAGE }),
    )
    .output(deckCheckSubmissionResultResponseSchema),
  submit: oc
    .route({ method: "POST", path: "/api/v1/deck-check/mine/{entryId}/submit", tags: [TAG] })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  unlock: oc
    .route({ method: "POST", path: "/api/v1/deck-check/mine/{entryId}/unlock", tags: [TAG] })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  cancelUnlock: oc
    .route({ method: "DELETE", path: "/api/v1/deck-check/mine/{entryId}/unlock", tags: [TAG] })
    .input(playerDeckCheckEntryParamSchema)
    .output(playerDeckCheckEntryDetailResponseSchema),
  submissionPage: oc
    .route({ method: "GET", path: "/api/v1/deck-check/submissions/{token}", tags: [TAG] })
    .input(deckCheckSubmissionTokenParamSchema)
    .output(deckCheckSubmissionPageResponseSchema),
  submitToToken: oc
    .route({ method: "POST", path: "/api/v1/deck-check/submissions/{token}", tags: [TAG] })
    .input(
      deckCheckSubmissionTokenParamSchema
        .extend(playerDeckCheckSubmissionShape)
        .refine(exactlyOneDeckCheckSubmissionSource, { message: ONE_SOURCE_MESSAGE }),
    )
    .output(deckCheckSubmissionResultResponseSchema),
  claim: oc
    .route({ method: "POST", path: "/api/v1/deck-check/claim/{token}", tags: [TAG] })
    .input(deckCheckClaimTokenParamSchema)
    .output(deckCheckClaimResultResponseSchema),
};

export type DeckCheckPlayerContract = typeof deckCheckPlayerContract;
