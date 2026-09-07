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
} from "@openrift/shared/schemas";
import { z } from "zod";

extendZodWithOpenApi(z);

// The service validates the transition matrix; `withdrawn` pulls the entry
// from the event, mirroring the provider's withdrawal flag.
export const deckCheckEntryStateChangeSchema = z.object({
  state: z.enum(["editable", "submitted", "approved", "checked", "withdrawn"]),
  reviewOutcome: z.enum(["ok", "issue"]).nullish(),
  notes: z.string().max(4000).nullish(),
  playerMessage: z.string().max(2000).nullish(),
});

export const updateDeckCheckEntrySchema = z.object({
  playerName: z.string().min(1).max(120).optional(),
  riotId: z.string().max(120).nullish(),
  playerMessage: z.string().max(2000).nullish(),
  allowDeckPublishing: z.boolean().optional(),
  allowNameSharing: z.boolean().optional(),
  allowRiotIdSharing: z.boolean().optional(),
});

export const updateDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  section: z.string().min(1).max(50).optional(),
  copies: z.number().int().min(1).max(99).optional(),
});

// The server re-derives the target zone for each id; the body names only the cards to move.
export const applyDeckCheckZoneFixesSchema = z.object({
  cardIds: z.array(z.string()).min(1).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY),
});

export const createDeckCheckEntrySchema = z.object({
  participantId: z.uuid(),
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

const deckCheckEventStatusSchema = z.enum(["active", "archived"]);

const deckCheckEntrySourceSchema = z.enum(["api", "manual", "self"]);

export const deckCheckClaimSourceSchema = z.enum(["judge_manual", "self_submit", "claim_link"]);

export const deckCheckEventSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    eventDate: z.string().nullable(),
    format: z.string().nullable(),
    allowedSets: z.array(z.string()).nullable(),
    status: deckCheckEventStatusSchema,
    entryCount: z.number().int().nonnegative(),
    approvedCount: z.number().int().nonnegative(),
    checkedCount: z.number().int().nonnegative(),
    listLockMode: z.enum(["on_submit", "at_deadline"]),
    allowSelfSubmission: z.boolean(),
    submissionToken: z.string().nullable(),
    submissionsCloseAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckCheckEventSummaryResponse");

export const deckCheckEntrySummaryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  participantId: z.string().nullable(),
  participantStatus: z.enum(["requested", "invited", "active", "dropped", "no_show"]).nullable(),
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

export const deckCheckChangeLineSchema = z.object({
  name: z.string(),
  zone: z.string(),
  quantity: z.number().int().positive(),
});

export const deckCheckChangeSummarySchema = z.object({
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

export const deckCheckEntryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: deckCheckEntrySourceSchema,
  playerName: z.string(),
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

export const deckCheckReResolveResponseSchema = z
  .object({ updatedLines: z.number().int().nonnegative() })
  .openapi("DeckCheckReResolveResponse");
