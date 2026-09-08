import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  deckZoneSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { z } from "zod";

extendZodWithOpenApi(z);

/** Deck fields are null together for a row the archive has no list for — most of a real event's field. */
export const adminMetaPlayerSchema = z
  .object({
    id: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legendCardId: z.string().nullable(),
    legendName: z.string().nullable(),
    championCardId: z.string().nullable(),
    championName: z.string().nullable(),
    listStatus: metaListStatusSchema,
    deckId: z.string().nullable(),
    shareToken: z.string().nullable(),
    deckName: z.string().nullable(),
    deckFormat: deckFormatSchema.nullable(),
    cardCount: z.number().int().nonnegative(),
    claimedFields: z.array(z.string()),
  })
  .openapi("AdminMetaPlayer");

/**
 * Structured, already-resolved card rows, not a deck code — the admin client
 * parses whatever was pasted and sends the resolved cards.
 */
export const metaDeckCardSchema = z.object({
  cardId: z.uuid(),
  zone: deckZoneSchema,
  quantity: z.number().int().positive(),
  preferredPrintingId: z.uuid().nullable().optional(),
});

/** Free-form: the format owns the schema and the handler validates it. */
const formatConfigSchema = z.record(z.string(), z.unknown()).nullable();

export const attachedListStatusSchema = metaListStatusSchema.exclude(["none"]);

/**
 * Present creates or replaces the archived deck (and mints its permalink);
 * absent leaves the row standings-only.
 */
const metaPlayerListSchema = z.object({
  name: z.string().min(1).max(200),
  format: z.string().min(1),
  formatConfig: formatConfigSchema.optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  listStatus: attachedListStatusSchema.optional().default("full"),
});

const playerScalarFields = {
  playerName: z.string().min(1).max(80),
  rank: z.number().int().min(1),
  rankIsTier: z.boolean().optional().default(false),
  wins: z.number().int().min(0).nullable().optional().default(null),
  losses: z.number().int().min(0).nullable().optional().default(null),
  draws: z.number().int().min(0).nullable().optional().default(null),
  legendCardId: z.uuid().nullable().optional().default(null),
  championCardId: z.uuid().nullable().optional().default(null),
};

export const createMetaPlayerSchema = z.object({
  eventId: z.uuid(),
  ...playerScalarFields,
  list: metaPlayerListSchema.nullable().optional().default(null),
});
