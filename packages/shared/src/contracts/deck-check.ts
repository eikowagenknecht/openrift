import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckCheckEntryCardResponseSchema,
  deckCheckEntryStateSchema,
  deckCheckReviewOutcomeSchema,
  deckViolationSchema,
  deckZoneSchema,
} from "@openrift/shared/response-schemas";
import {
  DECK_CHECK_MAX_CARD_LINES_PER_ENTRY,
  addDeckCheckCardSchema,
  friendGroupSlugParamSchema,
  friendGroupSlugSchema,
  withParams,
} from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const createDeckCheckEventSchema = z.object({
  name: z.string().min(1).max(120),
  eventDate: z.iso.date().nullish(),
  format: z.string().min(1).max(60).nullish(),
  allowedSets: z.array(z.string().min(1).max(20)).max(50).nullish(),
});

export const updateDeckCheckEventSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  eventDate: z.iso.date().nullish(),
  format: z.string().min(1).max(60).nullish(),
  allowedSets: z.array(z.string().min(1).max(20)).max(50).nullish(),
  status: z.enum(["active", "archived"]).optional(),
  /** When a submitted list locks against player changes (TR 401.3, ADR-027). */
  listLockMode: z.enum(["on_submit", "at_deadline"]).optional(),
  /** Player self-submission opt-in (ADR-026); enabling mints a token server-side. */
  allowSelfSubmission: z.boolean().optional(),
  submissionsCloseAt: z.iso.datetime({ offset: true }).nullish(),
});

/**
 * A judge moving an entry through the lifecycle (ADR-027). The service
 * validates the transition matrix; `reviewOutcome` is required when targeting
 * `checked`, marks a rejection when targeting `editable`, and records an
 * in-place issue when "targeting" `submitted` from `submitted` (for unclaimed
 * entries). `withdrawn` pulls the entry from the event (mirroring the
 * provider's withdrawal flag); targeting `submitted` from `withdrawn`
 * restores it.
 */
export const deckCheckEntryStateChangeSchema = z.object({
  state: z.enum(["editable", "submitted", "approved", "checked", "withdrawn"]),
  reviewOutcome: z.enum(["ok", "issue"]).nullish(),
  notes: z.string().max(4000).nullish(),
  /** Optional player-facing message stored alongside the transition. */
  playerMessage: z.string().max(2000).nullish(),
});

export const updateDeckCheckEntrySchema = z.object({
  playerName: z.string().min(1).max(120).optional(),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  /** Judge-authored message shown to the linked player (ADR-026). */
  playerMessage: z.string().max(2000).nullish(),
  /** Consent for the organizer to publish the deck list publicly. */
  allowDeckPublishing: z.boolean().optional(),
  /** Consent to show the player's name on public platforms. */
  allowNameSharing: z.boolean().optional(),
  /** Consent to show the player's Riot ID on public platforms. */
  allowRiotIdSharing: z.boolean().optional(),
});

export const updateDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  /**
   * Optional zone correction. A provider's free-text section string, mapped to a
   * deck zone server-side exactly like an added card; omitted leaves the zone as-is.
   */
  section: z.string().min(1).max(50).optional(),
  /**
   * How many copies to move when `section` changes the zone. Omitted (or >= the
   * line's quantity) moves the whole line; fewer splits it, leaving the rest in
   * place. Ignored without a zone change.
   */
  copies: z.number().int().min(1).max(99).optional(),
});

/**
 * A judge confirming which of the suggested zone corrections to apply. The
 * server re-derives the target zone for each id, so the body only names the
 * cards to move, never the destination — a deliberately mis-zoned card simply
 * gets left out of the list.
 */
export const applyDeckCheckZoneFixesSchema = z.object({
  cardIds: z.array(z.string()).min(1).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY),
});

/**
 * A judge hand-creating an entrant when the organizer push isn't available.
 * The server stamps a `manual:`-prefixed external id and resolves the cards the
 * same way a push would.
 */
export const createDeckCheckEntrySchema = z.object({
  playerName: z.string().min(1).max(120),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  cards: z.array(addDeckCheckCardSchema).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).default([]),
});

export const deckCheckTickSchema = z.object({
  /** 0-based physical copy within the card line. */
  copyIndex: z.number().int().min(0).max(98),
  found: z.boolean(),
});

export const mintDeckCheckKeySchema = z.object({
  label: z.string().min(1).max(120),
});

export const updateDeckCheckKeySchema = z.object({
  label: z.string().min(1).max(120),
});

export const deckCheckEventParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
});

export const deckCheckEntryParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
});

export const deckCheckEntryCardParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
});

export const deckCheckCardCopyParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
  copyIndex: z.coerce.number().int().min(0).max(98),
});

export const deckCheckKeyParamSchema = z.object({
  slug: friendGroupSlugSchema,
  keyId: z.uuid(),
});

/** Judge linking an entry to an OpenRift account. */
export const deckCheckLinkSchema = z.object({
  userId: z.string().min(1).max(64),
});

/** Judge account search for the manual link; exact email or name prefix. */
export const deckCheckAccountSearchSchema = z.object({
  q: z.string().min(2).max(254),
});

const deckCheckEventStatusSchema = z.enum(["active", "archived"]);

const deckCheckEntrySourceSchema = z.enum(["api", "manual", "self"]);

const deckCheckClaimSourceSchema = z.enum([
  "email_auto",
  "judge_manual",
  "self_submit",
  "claim_link",
]);

export const deckCheckEventSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    eventDate: z.string().nullable(),
    format: z.string().nullable(),
    allowedSets: z.array(z.string()).nullable(),
    status: deckCheckEventStatusSchema,
    entryCount: z.number().int().nonnegative(),
    checkedCount: z.number().int().nonnegative(),
    listLockMode: z.enum(["on_submit", "at_deadline"]),
    allowSelfSubmission: z.boolean(),
    submissionToken: z.string().nullable(),
    submissionsCloseAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckCheckEventSummaryResponse");

export const deckCheckEventListResponseSchema = z
  .object({ items: z.array(deckCheckEventSummaryResponseSchema) })
  .openapi("DeckCheckEventListResponse");

const deckCheckEntrySummaryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: deckCheckEntrySourceSchema,
  playerName: z.string(),
  submittedAt: z.string().nullable(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  checkedByName: z.string().nullable(),
  checkedAt: z.string().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  changedSinceReview: z.boolean(),
  unlockRequestedAt: z.string().nullable(),
  claimedUserName: z.string().nullable(),
  copyCount: z.number().int().nonnegative(),
  verifiedCopyCount: z.number().int().nonnegative(),
  unmatchedLineCount: z.number().int().nonnegative(),
});

export const deckCheckEventDetailResponseSchema = z
  .object({
    event: deckCheckEventSummaryResponseSchema,
    entries: z.array(deckCheckEntrySummaryResponseSchema),
  })
  .openapi("DeckCheckEventDetailResponse");

const deckCheckChangeLineSchema = z.object({
  name: z.string(),
  zone: z.string(),
  quantity: z.number().int().positive(),
});

const deckCheckChangeSummarySchema = z.object({
  added: z.array(deckCheckChangeLineSchema),
  removed: z.array(deckCheckChangeLineSchema),
  changed: z.array(
    z.object({
      name: z.string(),
      zone: z.string(),
      oldQuantity: z.number().int().positive(),
      newQuantity: z.number().int().positive(),
    }),
  ),
});

const deckCheckEntryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: deckCheckEntrySourceSchema,
  playerName: z.string(),
  playerEmail: z.string().nullable(),
  riotId: z.string().nullable(),
  allowDeckPublishing: z.boolean(),
  allowNameSharing: z.boolean(),
  allowRiotIdSharing: z.boolean(),
  submittedAt: z.string().nullable(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  checkedBy: z.string().nullable(),
  checkedByName: z.string().nullable(),
  checkedAt: z.string().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  unlockRequestedAt: z.string().nullable(),
  notes: z.string().nullable(),
  changeSummary: deckCheckChangeSummarySchema.nullable(),
  withdrawnAt: z.string().nullable(),
  claimedUserId: z.string().nullable(),
  claimedUserName: z.string().nullable(),
  claimSource: deckCheckClaimSourceSchema.nullable(),
  claimBlocked: z.boolean(),
  claimToken: z.string().nullable(),
  playerMessage: z.string().nullable(),
  updatedAt: z.string(),
});

export const deckCheckEntryDetailResponseSchema = z
  .object({
    event: deckCheckEventSummaryResponseSchema,
    entry: deckCheckEntryResponseSchema,
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
    typeCounts: z.array(z.object({ cardType: z.string(), count: z.number().int().nonnegative() })),
    domainDistribution: z.array(
      z.object({ domain: z.string(), count: z.number().int().nonnegative() }),
    ),
    zoneSuggestions: z.array(
      z.object({
        cardId: z.string(),
        cardName: z.string(),
        currentZone: deckZoneSchema,
        suggestedZone: deckZoneSchema,
      }),
    ),
  })
  .openapi("DeckCheckEntryDetailResponse");

export const deckCheckKeyResponseSchema = z
  .object({
    id: z.string(),
    tokenPrefix: z.string(),
    label: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
  })
  .openapi("DeckCheckKeyResponse");

export const deckCheckKeysResponseSchema = z
  .object({ items: z.array(deckCheckKeyResponseSchema) })
  .openapi("DeckCheckKeysResponse");

export const deckCheckKeyMintedResponseSchema = z
  .object({ key: deckCheckKeyResponseSchema, token: z.string() })
  .openapi("DeckCheckKeyMintedResponse");

export const deckCheckAccountSearchResponseSchema = z
  .object({
    items: z.array(z.object({ id: z.string(), name: z.string().nullable(), email: z.string() })),
  })
  .openapi("DeckCheckAccountSearchResponse");

export const deckCheckReResolveResponseSchema = z
  .object({ updatedLines: z.number().int().nonnegative() })
  .openapi("DeckCheckReResolveResponse");

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
