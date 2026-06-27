import { oc } from "@orpc/contract";

import {
  deckCheckAccountSearchResponseSchema,
  deckCheckEntryDetailResponseSchema,
  deckCheckEventDetailResponseSchema,
  deckCheckEventListResponseSchema,
  deckCheckEventSummaryResponseSchema,
  deckCheckKeyMintedResponseSchema,
  deckCheckKeyResponseSchema,
  deckCheckKeysResponseSchema,
  deckCheckReResolveResponseSchema,
} from "../response-schemas.js";
import {
  addDeckCheckCardSchema,
  applyDeckCheckZoneFixesSchema,
  createDeckCheckEntrySchema,
  createDeckCheckEventSchema,
  deckCheckAccountSearchSchema,
  deckCheckCardCopyParamSchema,
  deckCheckEntryCardParamSchema,
  deckCheckEntryParamSchema,
  deckCheckEntryStateChangeSchema,
  deckCheckEventParamSchema,
  deckCheckKeyParamSchema,
  deckCheckLinkSchema,
  deckCheckTickSchema,
  friendGroupSlugParamSchema,
  mintDeckCheckKeySchema,
  updateDeckCheckCardSchema,
  updateDeckCheckEntrySchema,
  updateDeckCheckEventSchema,
  updateDeckCheckKeySchema,
  withParams,
} from "../schemas.js";

const TAG = "Deck Check";

const CHECKS = "/api/v1/friend-groups/{slug}/checks";

/**
 * oRPC contract for the judge-facing deck-check surface (ADR-026/027), mounted
 * under `/api/v1/friend-groups/{slug}/checks` and `/deck-check-keys` /
 * `/deck-check-account-search`. Every endpoint is role-gated (judge or admin)
 * inside the group; the access checks and not-found / conflict / validation
 * states are thrown as `AppError` and bridged to ORPCErrors in the
 * implementation, so the contract declares no per-code typed errors.
 */
export const deckCheckContract = {
  listEvents: oc
    .route({ method: "GET", path: CHECKS, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(deckCheckEventListResponseSchema),
  createEvent: oc
    .route({ method: "POST", path: CHECKS, tags: [TAG], successStatus: 201 })
    .input(withParams(friendGroupSlugParamSchema, createDeckCheckEventSchema))
    .output(deckCheckEventSummaryResponseSchema),
  getEventDetail: oc
    .route({ method: "GET", path: `${CHECKS}/{eventId}`, tags: [TAG] })
    .input(deckCheckEventParamSchema)
    .output(deckCheckEventDetailResponseSchema),
  updateEvent: oc
    .route({ method: "PATCH", path: `${CHECKS}/{eventId}`, tags: [TAG] })
    .input(withParams(deckCheckEventParamSchema, updateDeckCheckEventSchema))
    .output(deckCheckEventSummaryResponseSchema),
  deleteEvent: oc
    .route({ method: "DELETE", path: `${CHECKS}/{eventId}`, tags: [TAG], successStatus: 204 })
    .input(deckCheckEventParamSchema),
  reResolveEvent: oc
    .route({ method: "POST", path: `${CHECKS}/{eventId}/re-resolve`, tags: [TAG] })
    .input(deckCheckEventParamSchema)
    .output(deckCheckReResolveResponseSchema),
  createManualEntry: oc
    .route({ method: "POST", path: `${CHECKS}/{eventId}/entries`, tags: [TAG], successStatus: 201 })
    .input(withParams(deckCheckEventParamSchema, createDeckCheckEntrySchema))
    .output(deckCheckEntryDetailResponseSchema),
  getEntryDetail: oc
    .route({ method: "GET", path: `${CHECKS}/{eventId}/entries/{entryId}`, tags: [TAG] })
    .input(deckCheckEntryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  setEntryState: oc
    .route({ method: "PUT", path: `${CHECKS}/{eventId}/entries/{entryId}/state`, tags: [TAG] })
    .input(withParams(deckCheckEntryParamSchema, deckCheckEntryStateChangeSchema))
    .output(deckCheckEntryDetailResponseSchema),
  denyUnlockRequest: oc
    .route({
      method: "DELETE",
      path: `${CHECKS}/{eventId}/entries/{entryId}/unlock-request`,
      tags: [TAG],
    })
    .input(deckCheckEntryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  updateEntry: oc
    .route({ method: "PATCH", path: `${CHECKS}/{eventId}/entries/{entryId}`, tags: [TAG] })
    .input(withParams(deckCheckEntryParamSchema, updateDeckCheckEntrySchema))
    .output(deckCheckEntryDetailResponseSchema),
  deleteEntry: oc
    .route({
      method: "DELETE",
      path: `${CHECKS}/{eventId}/entries/{entryId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(deckCheckEntryParamSchema),
  addCard: oc
    .route({ method: "POST", path: `${CHECKS}/{eventId}/entries/{entryId}/cards`, tags: [TAG] })
    .input(withParams(deckCheckEntryParamSchema, addDeckCheckCardSchema))
    .output(deckCheckEntryDetailResponseSchema),
  renameCard: oc
    .route({
      method: "PATCH",
      path: `${CHECKS}/{eventId}/entries/{entryId}/cards/{cardId}`,
      tags: [TAG],
    })
    .input(withParams(deckCheckEntryCardParamSchema, updateDeckCheckCardSchema))
    .output(deckCheckEntryDetailResponseSchema),
  applyZoneFixes: oc
    .route({
      method: "POST",
      path: `${CHECKS}/{eventId}/entries/{entryId}/zone-fixes`,
      tags: [TAG],
    })
    .input(withParams(deckCheckEntryParamSchema, applyDeckCheckZoneFixesSchema))
    .output(deckCheckEntryDetailResponseSchema),
  removeCardCopy: oc
    .route({
      method: "DELETE",
      path: `${CHECKS}/{eventId}/entries/{entryId}/cards/{cardId}/copies/{copyIndex}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(deckCheckCardCopyParamSchema),
  tickCard: oc
    .route({
      method: "PUT",
      path: `${CHECKS}/{eventId}/entries/{entryId}/cards/{cardId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(deckCheckEntryCardParamSchema, deckCheckTickSchema)),
  linkEntry: oc
    .route({ method: "PUT", path: `${CHECKS}/{eventId}/entries/{entryId}/link`, tags: [TAG] })
    .input(withParams(deckCheckEntryParamSchema, deckCheckLinkSchema))
    .output(deckCheckEntryDetailResponseSchema),
  unlinkEntry: oc
    .route({ method: "DELETE", path: `${CHECKS}/{eventId}/entries/{entryId}/link`, tags: [TAG] })
    .input(deckCheckEntryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  searchAccounts: oc
    .route({
      method: "GET",
      path: "/api/v1/friend-groups/{slug}/deck-check-account-search",
      tags: [TAG],
    })
    .input(withParams(friendGroupSlugParamSchema, deckCheckAccountSearchSchema))
    .output(deckCheckAccountSearchResponseSchema),
  regenerateSubmissionToken: oc
    .route({ method: "POST", path: `${CHECKS}/{eventId}/submission-token`, tags: [TAG] })
    .input(deckCheckEventParamSchema)
    .output(deckCheckEventSummaryResponseSchema),
  listKeys: oc
    .route({ method: "GET", path: "/api/v1/friend-groups/{slug}/deck-check-keys", tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(deckCheckKeysResponseSchema),
  mintKey: oc
    .route({
      method: "POST",
      path: "/api/v1/friend-groups/{slug}/deck-check-keys",
      tags: [TAG],
      successStatus: 201,
    })
    .input(withParams(friendGroupSlugParamSchema, mintDeckCheckKeySchema))
    .output(deckCheckKeyMintedResponseSchema),
  renameKey: oc
    .route({
      method: "PATCH",
      path: "/api/v1/friend-groups/{slug}/deck-check-keys/{keyId}",
      tags: [TAG],
    })
    .input(withParams(deckCheckKeyParamSchema, updateDeckCheckKeySchema))
    .output(deckCheckKeyResponseSchema),
  revokeKey: oc
    .route({
      method: "DELETE",
      path: "/api/v1/friend-groups/{slug}/deck-check-keys/{keyId}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(deckCheckKeyParamSchema),
};

export type DeckCheckContract = typeof deckCheckContract;
