import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { metaListStatusSchema } from "@openrift/shared/response-schemas";
import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { META_OVERLAY_STATUSES } from "../../types/enums.js";

extendZodWithOpenApi(z);

/**
 * Bounds and vocabulary are checked per item in the ingest service; one bad
 * event/player is skipped, and the batch still succeeds.
 */
const nullStr = z
  .string()
  .nullable()
  .optional()
  .default(null)
  .transform((value) => (value === null || value.trim() === "" ? null : value));

const nullNum = z.number().nullable().optional().default(null);

const uploadDeckCardSchema = z.object({
  name: z.string(),
  zone: z.string(),
  quantity: z.number(),
});

const uploadPlayerSchema = z
  .object({
    externalId: z.string(),
    playerName: z.string(),
    rank: z.number(),
    rankIsTier: z.boolean().optional().default(false),
    wins: nullNum,
    losses: nullNum,
    draws: nullNum,
    matchPoints: nullNum,
    opponentMatchWinPct: nullNum,
    gameWinPct: nullNum,
    opponentGameWinPct: nullNum,
    entryStatus: nullStr,
    legendName: nullStr,
    championName: nullStr,
    cards: z.array(uploadDeckCardSchema).nullable().optional().default(null),
    listStatus: metaListStatusSchema.optional(),
  })
  .transform((player, ctx) => {
    const cards = player.cards !== null && player.cards.length > 0 ? player.cards : null;
    if (cards === null) {
      if (player.listStatus !== undefined && player.listStatus !== "none") {
        ctx.addIssue({
          code: "custom",
          message: `player "${player.externalId}" claims listStatus "${player.listStatus}" but carries no cards`,
        });
        return z.NEVER;
      }
      return { ...player, cards, listStatus: "none" as const };
    }
    if (player.listStatus === "none") {
      ctx.addIssue({
        code: "custom",
        message: `player "${player.externalId}" carries cards but claims listStatus "none"`,
      });
      return z.NEVER;
    }
    return { ...player, cards, listStatus: player.listStatus ?? ("full" as const) };
  });

const uploadEventSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  eventDate: z.string(),
  format: z.string(),
  playerCount: nullNum,
  organizer: nullStr,
  sourceUrl: nullStr,
  notes: nullStr,
  tier: nullStr,
  country: nullStr,
  location: nullStr,
  extraData: z.unknown().nullable().optional().default(null),
  players: z.array(uploadPlayerSchema).optional().default([]),
});

export const metaUploadSchema = z.object({
  provider: z.string().trim().min(1),
  events: z.array(uploadEventSchema).min(1),
});

const uploadEventDetailSchema = z.object({ externalId: z.string(), name: z.string() });

const uploadUnresolvedSchema = z.object({
  eventExternalId: z.string(),
  playerExternalId: z.string(),
  names: z.array(z.string()),
});

export const metaUploadResponseSchema = z
  .object({
    provider: z.string(),
    newEvents: z.number().int(),
    updatedEvents: z.number().int(),
    unchangedEvents: z.number().int(),
    newPlayers: z.number().int(),
    updatedPlayers: z.number().int(),
    unchangedPlayers: z.number().int(),
    ignoredSkipped: z.number().int(),
    errors: z.array(z.string()),
    newEventDetails: z.array(uploadEventDetailSchema),
    updatedEventDetails: z.array(uploadEventDetailSchema),
    unresolvedCards: z.array(uploadUnresolvedSchema),
  })
  .openapi("MetaUploadResponse");

export const metaUploadSummarySchema = z
  .object({
    eventOverlayId: z.string(),
    provider: z.string(),
    externalId: z.string(),
    status: z.enum(META_OVERLAY_STATUSES),
    acceptedAt: isoDateTime.nullable(),
    acceptedPlayers: z.number().int(),
    pendingPlayers: z.number().int(),
    mintedPlayers: z.number().int(),
  })
  .openapi("MetaUploadSummary");

export const metaUploadRevertResultSchema = z
  .object({
    metaEventIds: z.array(z.string()),
    players: z.number().int(),
    eventRejected: z.boolean(),
  })
  .openapi("MetaUploadRevertResult");
