import { oc } from "@orpc/contract";

import {
  deckCheckClaimResultResponseSchema,
  deckCheckSubmissionPageResponseSchema,
  deckCheckSubmissionResultResponseSchema,
  playerDeckCheckEntriesResponseSchema,
  playerDeckCheckEntryDetailResponseSchema,
} from "../response-schemas.js";
import {
  deckCheckClaimTokenParamSchema,
  deckCheckSubmissionTokenParamSchema,
  exactlyOneDeckCheckSubmissionSource,
  playerDeckCheckEntryParamSchema,
  playerDeckCheckSubmissionShape,
} from "../schemas.js";

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
