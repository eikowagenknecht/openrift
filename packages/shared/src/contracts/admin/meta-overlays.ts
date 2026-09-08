import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { metaEntryStatusSchema, metaOverlayStatusSchema } from "@openrift/shared/response-schemas";
import { isoDate, isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { META_PLAYER_OVERLAY_FIELDS } from "../../types/enums.js";
import { attachedListStatusSchema, metaDeckCardSchema } from "./meta-players.js";

extendZodWithOpenApi(z);

/**
 * Field-by-field correction: present is claimed, absent says nothing, null on
 * a nullable field clears it. `playerName: null` reverts to the source's name.
 */
export const playerOverlayFieldsSchema = z
  .object({
    playerName: z.string().min(1).max(80).nullable(),
    rank: z.number().int().min(1),
    rankIsTier: z.boolean(),
    wins: z.number().int().min(0).nullable(),
    losses: z.number().int().min(0).nullable(),
    draws: z.number().int().min(0).nullable(),
    matchPoints: z.number().int().min(0).nullable(),
    opponentMatchWinPct: z.number().min(0).max(1).nullable(),
    gameWinPct: z.number().min(0).max(1).nullable(),
    opponentGameWinPct: z.number().min(0).max(1).nullable(),
    entryStatus: metaEntryStatusSchema.nullable(),
    legendCardId: z.uuid().nullable(),
    championCardId: z.uuid().nullable(),
  })
  .partial();

/** No `format`: promotion decides it. `name` applies as a direct rename after promote, not a tracked claim. */
export const playerOverlayListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  listStatus: attachedListStatusSchema.optional().default("full"),
});

/** `to` nullable means "clear this field", distinct from the field being absent from the change list entirely. */
const metaOverlayFieldChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

const metaOverlayCardSchema = z.object({
  lineNumber: z.number().int().nonnegative(),
  zone: z.string(),
  quantity: z.number().int().positive(),
  cardName: z.string(),
  cardId: z.string().nullable(),
});

export const metaOverlayMatchStateSchema = z.enum([
  "linked",
  "exact",
  "candidates",
  "none",
  "unscored",
]);

/** Which live standings row a player overlay lands on, as far as the queue can tell without a second fetch. */
export const metaOverlayRowMatchSchema = z.object({
  state: metaOverlayMatchStateSchema,
  metaEventPlayerId: z.string().nullable(),
  playerName: z.string().nullable(),
  rank: z.number().int().nullable(),
  rankIsTier: z.boolean().nullable(),
  candidateCount: z.number().int().nonnegative(),
});

export const metaOverlayQueueRowSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["event", "player"]),
    status: metaOverlayStatusSchema,
    provider: z.string().nullable(),
    sourceEventExternalId: z.string().nullable(),
    sourcePlayerExternalId: z.string().nullable(),
    eventOverlayId: z.string().nullable(),
    metaEventId: z.string().nullable(),
    metaEventPlayerId: z.string().nullable(),
    metaEventName: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    eventDate: isoDate.nullable(),
    eventFormat: z.string().nullable(),
    proposedName: z.string().nullable(),
    playerName: z.string().nullable(),
    rank: z.number().int().nullable(),
    rankIsTier: z.boolean().nullable(),
    match: metaOverlayRowMatchSchema.nullable(),
    submittedBy: z.string().nullable(),
    submissionNote: z.string().nullable(),
    changes: z.array(metaOverlayFieldChangeSchema),
    cards: z.array(metaOverlayCardSchema),
    unresolvedNames: z.array(z.string()),
    createdAt: isoDateTime,
  })
  .openapi("MetaOverlayQueueRow");

export const metaOverlayDetailSchema = metaOverlayQueueRowSchema.openapi("MetaOverlayDetail");

/** Absent keeps every claim. `cards` and `listStatus` are one claim: naming either keeps both. */
export const acceptClaimFields = z
  .array(z.enum(META_PLAYER_OVERLAY_FIELDS))
  .nullable()
  .optional()
  .default(null);

export const metaOverlayBulkAcceptResultSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    metaEventIds: z.array(z.string()),
  })
  .openapi("MetaOverlayBulkAcceptResult");

export const metaOverlayReviewResultSchema = z
  .object({
    metaEventId: z.string().nullable(),
    created: z.boolean(),
  })
  .openapi("MetaOverlayReviewResult");

/**
 * `claimedByOverlay` fields are decided by an accepted overlay, not
 * promotion — a source can disagree with live and still be correct.
 */
const metaEventDriftFieldSchema = z.object({
  field: z.string(),
  live: z.string().nullable(),
  bySource: z.array(z.object({ value: z.string().nullable(), raw: z.string().nullable() })),
  claimedByOverlay: z.boolean(),
  wonBy: z.string().nullable(),
});

export const metaEventDriftSchema = z
  .object({
    metaEventId: z.string(),
    sources: z.array(
      z.object({
        id: z.string(),
        provider: z.string().nullable(),
        externalId: z.string().nullable(),
        label: z.string(),
        priority: z.number().int(),
        hasMirror: z.boolean(),
      }),
    ),
    fields: z.array(metaEventDriftFieldSchema),
  })
  .openapi("MetaEventDrift");
