import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  metaEventTierSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { isoDate, isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicDeckDetailResponseSchema } from "./public-decks.js";

extendZodWithOpenApi(z);

const TAG = "Meta archive";
const BASE = "/api/v1/meta";

export const metaCardRefSchema = z
  .object({
    cardId: z.string(),
    name: z.string(),
    slug: z.string(),
    imageId: z.string().nullable(),
    domains: z.array(z.string()),
    archiveSlug: z.string().nullable(),
  })
  .openapi("MetaCardRef");

export const metaEventFinishSchema = z
  .object({
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    playerKey: z.string().nullable(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legend: metaCardRefSchema.nullable(),
  })
  .openapi("MetaEventFinish");

export const metaEventSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: deckFormatSchema,
    tier: metaEventTierSchema,
    /** ISO 3166-1 alpha-2. */
    country: z.string().nullable(),
    location: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    playerRowCount: z.number().int().nonnegative(),
    deckCount: z.number().int().nonnegative(),
    topFinishes: z.array(metaEventFinishSchema),
  })
  .openapi("MetaEventSummary");

export const metaEventSourceSchema = z
  .object({
    id: z.string(),
    provider: z.string().nullable(),
    externalId: z.string().nullable(),
    label: z.string(),
    sourceUrl: z.string().nullable(),
  })
  .openapi("MetaEventSource");

export const metaEventDetailSchema = metaEventSummarySchema
  .extend({
    notes: z.string().nullable(),
    sources: z.array(metaEventSourceSchema),
    contributors: z.array(z.string()),
  })
  .openapi("MetaEventDetail");

const metaDeckEventSchema = z.object({
  slug: z.string(),
  name: z.string(),
  eventDate: isoDate,
  format: deckFormatSchema,
  tier: metaEventTierSchema,
  /** ISO 3166-1 alpha-2. */
  country: z.string().nullable(),
});

/**
 * `deckId` and `shareToken` are set exactly for rows with `listStatus !== "none"`.
 */
export const metaEventPlayerSchema = z
  .object({
    id: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    playerKey: z.string().nullable(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legend: metaCardRefSchema.nullable(),
    champion: metaCardRefSchema.nullable(),
    deckId: z.string().nullable(),
    deckName: z.string().nullable(),
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
  })
  .openapi("MetaEventPlayer");

/**
 * Distinguishes a cut from the Swiss rounds before it: match rows carry only
 * `phaseOrder`, so infer the stage from this, not from round shape.
 */
export const metaEventPhaseSchema = z
  .object({
    phaseOrder: z.number().int(),
    name: z.string().nullable(),
    roundType: z.string(),
    roundCount: z.number().int().nullable(),
    rankRequired: z.number().int().nullable(),
    maxGameWins: z.number().int().nullable(),
  })
  .openapi("MetaEventPhase");

/** Per-match facts only; no aggregate is computed or served from here. */
export const metaEventMatchSchema = z
  .object({
    phaseOrder: z.number().int(),
    roundNumber: z.number().int(),
    tableNumber: z.number().int().nullable(),
    isBye: z.boolean(),
    isDraw: z.boolean(),
    player1Id: z.string(),
    player2Id: z.string().nullable(),
    winnerId: z.string().nullable(),
    gamesWonP1: z.number().int().nullable(),
    gamesWonP2: z.number().int().nullable(),
  })
  .openapi("MetaEventMatch");

export const metaDeckSummarySchema = z
  .object({
    playerId: z.string(),
    deckId: z.string(),
    shareToken: z.string(),
    listStatus: metaListStatusSchema,
    name: z.string(),
    format: deckFormatSchema,
    legendCardId: z.string().nullable(),
    legendName: z.string().nullable(),
    legendSlug: z.string().nullable(),
    legendArchiveSlug: z.string().nullable(),
    legendImageId: z.string().nullable(),
    championCardId: z.string().nullable(),
    championName: z.string().nullable(),
    championImageId: z.string().nullable(),
    playerName: z.string(),
    playerKey: z.string().nullable(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    event: metaDeckEventSchema,
  })
  .openapi("MetaDeckSummary");

export const metaEventListResponseSchema = z
  .object({ events: z.array(metaEventSummarySchema) })
  .openapi("MetaEventListResponse");

export const metaActivityKindSchema = z.enum(["event-added", "decks-added", "results-added"]);

/**
 * Additions are reported as bursts: rows of one kind landing on one event
 * within a UTC day collapse into one item.
 */
export const metaActivityItemSchema = z
  .object({
    kind: metaActivityKindSchema,
    occurredAt: isoDateTime,
    count: z.number().int().positive().nullable(),
    event: z.object({ slug: z.string(), name: z.string() }),
  })
  .openapi("MetaActivityItem");

/** Newest first. */
export const metaActivityResponseSchema = z
  .object({ items: z.array(metaActivityItemSchema) })
  .openapi("MetaActivityResponse");

/** Standings sorted best finish first. */
export const metaEventDetailResponseSchema = z
  .object({
    event: metaEventDetailSchema,
    players: z.array(metaEventPlayerSchema),
    matches: z.array(metaEventMatchSchema),
    phases: z.array(metaEventPhaseSchema),
  })
  .openapi("MetaEventDetailResponse");

export const metaDeckListResponseSchema = z
  .object({
    decks: z.array(metaDeckSummarySchema),
    total: z.number().int().nonnegative(),
  })
  .openapi("MetaDeckListResponse");

/**
 * `cards` is a pooled id list referenced by index. `entries`/`sideboard` are
 * flat `[cardIndex, quantity]` runs; every zone but the sideboard sums into `entries`.
 */
export const metaDeckCardIndexResponseSchema = z
  .object({
    cards: z.array(z.string()),
    decks: z.array(
      z.object({
        deckId: z.string(),
        entries: z.array(z.number().int().nonnegative()),
        sideboard: z.array(z.number().int().nonnegative()),
      }),
    ),
  })
  .openapi("MetaDeckCardIndexResponse");

/**
 * Same shape as `/decks/share/{token}`'s response; the share page's renderer
 * depends on this.
 */
export const metaDeckDetailResponseSchema = publicDeckDetailResponseSchema
  .extend({
    meta: z.object({
      event: metaDeckEventSchema.extend({ playerCount: z.number().int().nullable() }),
      listStatus: metaListStatusSchema,
      playerName: z.string(),
      playerKey: z.string().nullable(),
      rank: z.number().int(),
      rankIsTier: z.boolean(),
      wins: z.number().int().nullable(),
      losses: z.number().int().nullable(),
      draws: z.number().int().nullable(),
      contributors: z.array(z.string()),
    }),
  })
  .openapi("MetaDeckDetailResponse");

/**
 * `decksWithMainDeck` counts full and partial lists alike (a partial list's
 * main deck is complete). `totalEvents` and `eventsByTier` ignore the query's filters.
 */
export const metaCountsResponseSchema = z
  .object({
    totalPlayers: z.number().int().nonnegative(),
    decksWithMainDeck: z.number().int().nonnegative(),
    totalEvents: z.number().int().nonnegative(),
    eventsByTier: z.object({
      premier: z.number().int().nonnegative(),
      competitive: z.number().int().nonnegative(),
      local: z.number().int().nonnegative(),
    }),
  })
  .openapi("MetaCountsResponse");

const metaLegendEventSchema = z.object({
  slug: z.string(),
  name: z.string(),
  eventDate: isoDate,
  format: deckFormatSchema,
  tier: metaEventTierSchema,
  country: z.string().nullable(),
  playerCount: z.number().int().nullable(),
});

/** `shareToken` is set exactly for rows with `listStatus !== "none"`. */
export const metaLegendFinishSchema = z
  .object({
    playerId: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    playerKey: z.string().nullable(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
    event: metaLegendEventSchema,
  })
  .openapi("MetaLegendFinish");

const metaLegendEventRecordSchema = z.object({
  eventSlug: z.string(),
  bestRank: z.number().int(),
  rankIsTier: z.boolean(),
  finishes: z.number().int().nonnegative(),
  decklists: z.number().int().nonnegative(),
  won: z.boolean(),
});

export const metaLegendSummarySchema = z
  .object({
    slug: z.string(),
    legend: metaCardRefSchema,
    records: z.array(metaLegendEventRecordSchema),
  })
  .openapi("MetaLegendSummary");

export type MetaLegendEventRecord = z.infer<typeof metaLegendEventRecordSchema>;

export const metaLegendListResponseSchema = z
  .object({ legends: z.array(metaLegendSummarySchema) })
  .openapi("MetaLegendListResponse");

/** Facts only: never a rate, a share, or a comparison against another legend. */
export const metaLegendDetailResponseSchema = z
  .object({
    slug: z.string(),
    legend: metaCardRefSchema,
    counts: z.object({
      wins: z.number().int().nonnegative(),
      finishes: z.number().int().nonnegative(),
      decklists: z.number().int().nonnegative(),
    }),
    best: z.array(metaLegendFinishSchema),
    finishes: z.array(metaLegendFinishSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
  })
  .openapi("MetaLegendDetailResponse");

export const metaPlayerFinishSchema = z
  .object({
    playerId: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
    legend: metaCardRefSchema.nullable(),
    event: metaLegendEventSchema,
  })
  .openapi("MetaPlayerFinish");

/** Facts only: never a rate or a comparison against another player. */
export const metaPlayerDetailResponseSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    finishes: z.array(metaPlayerFinishSchema),
  })
  .openapi("MetaPlayerDetailResponse");

export const metaCountsQuerySchema = z.object({
  format: z.string().min(1).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/** Inclusive bounds; both ends are optional and independent. */
export const metaDateRangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/**
 * Plain strings, not the tier/format enums. A stale bookmark naming a
 * retired value narrows to nothing; the request still succeeds.
 */
const scopeFacetList = z.array(z.string().min(1)).max(300).optional();

/**
 * Each facet is an include list or an exclude list, never both. An event
 * with no value for a facet is outside every include list and inside every exclude list.
 */
export const metaScopeQuerySchema = metaDateRangeQuerySchema.extend({
  formats: scopeFacetList,
  formatsEx: scopeFacetList,
  tiers: scopeFacetList,
  tiersEx: scopeFacetList,
  countries: scopeFacetList,
  countriesEx: scopeFacetList,
});

/**
 * Sort order is fixed server-side (event date desc, then rank, then player),
 * not exposed as a query param.
 */
export const metaDeckQuerySchema = metaScopeQuerySchema.extend({
  legend: z.string().min(1).optional(),
  player: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const metaLegendQuerySchema = metaScopeQuerySchema.extend({
  slug: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
});

/**
 * oRPC contract for the public meta archive, mounted under `/api/v1/meta`.
 * Every route is anonymous (`auth: "public"`) and SSR-facing.
 *
 * `deck` 404s for a share token that resolves to a deck outside the archive,
 * so a regular user's shared deck can never be rendered as an archive entry.
 */
export const metaContract = {
  events: oc
    .route({ method: "GET", path: `${BASE}/events`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(metaDateRangeQuerySchema)
    .output(metaEventListResponseSchema),

  activity: oc
    .route({ method: "GET", path: `${BASE}/activity`, tags: [TAG] })
    .meta({ auth: "public", cache: "short" })
    .output(metaActivityResponseSchema),

  event: oc
    .route({ method: "GET", path: `${BASE}/events/{slug}`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(z.object({ slug: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaEventDetailResponseSchema),

  decks: oc
    .route({ method: "GET", path: `${BASE}/decks`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(metaDeckQuerySchema)
    .output(metaDeckListResponseSchema),

  deckCards: oc
    .route({ method: "GET", path: `${BASE}/deck-cards`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(metaDateRangeQuerySchema)
    .output(metaDeckCardIndexResponseSchema),

  deck: oc
    .route({ method: "GET", path: `${BASE}/decks/{token}`, tags: [TAG] })
    .meta({ auth: "public", cache: "short" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(metaDeckDetailResponseSchema),

  legends: oc
    .route({ method: "GET", path: `${BASE}/legends`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .output(metaLegendListResponseSchema),

  legend: oc
    .route({ method: "GET", path: `${BASE}/legends/{slug}`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(metaLegendQuerySchema)
    .errors({ NOT_FOUND: { message: "Legend not found" } })
    .output(metaLegendDetailResponseSchema),

  player: oc
    .route({ method: "GET", path: `${BASE}/players/{key}`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(z.object({ key: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Player not found" } })
    .output(metaPlayerDetailResponseSchema),

  counts: oc
    .route({ method: "GET", path: `${BASE}/counts`, tags: [TAG] })
    .meta({ auth: "public", cache: "short" })
    .input(metaCountsQuerySchema)
    .output(metaCountsResponseSchema),
};

export type MetaContract = typeof metaContract;
