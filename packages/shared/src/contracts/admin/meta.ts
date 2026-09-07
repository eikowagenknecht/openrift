import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  deckZoneSchema,
  metaEntryStatusSchema,
  metaEventTierSchema,
  metaOverlayStatusSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { idParamSchema, isoDate, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import {
  META_CROSS_SOURCE_STATES,
  META_EVENT_OVERLAY_FIELDS,
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
  META_EVENT_SOURCE_FILTERS,
  META_OVERLAY_STATUSES,
  META_PLAYER_OVERLAY_FIELDS,
} from "../../types/enums.js";
import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta archive";
const OVERLAY_TAG = "Admin - Meta overlays";
const BASE = "/api/admin/v1/meta";

/**
 * A slug here would be shadowed by `/meta`'s own static routes and never
 * reachable. Add a name whenever `/meta` gains a static child.
 */
export const RESERVED_META_EVENT_SLUGS = [
  "admin",
  "decks",
  "events",
  "legends",
  "new",
  "stats",
  "submissions",
  "submit",
];

const eventSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{2,49}$/u, "Slug must be 3-50 lowercase letters, digits, or hyphens")
  .refine((slug) => !RESERVED_META_EVENT_SLUGS.includes(slug), {
    message: `Reserved slug. Pick another: ${RESERVED_META_EVENT_SLUGS.join(", ")} are taken`,
  });

const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/u, "Country must be a two-letter ISO 3166-1 code, e.g. DE");

const eventBodySchema = z.object({
  slug: eventSlugSchema,
  name: z.string().min(1).max(120),
  eventDate: isoDate,
  format: z.string().min(1),
  playerCount: z.number().int().positive().nullable().optional(),
  organizer: z.string().min(1).max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  tier: metaEventTierSchema.optional(),
  country: countrySchema.nullable().optional(),
  location: z.string().min(1).max(500).nullable().optional(),
});

export const adminMetaEventSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: deckFormatSchema,
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    notes: z.string().nullable(),
    tier: metaEventTierSchema,
    country: z.string().nullable(),
    location: z.string().nullable(),
    playerRowCount: z.number().int().nonnegative(),
    deckCount: z.number().int().nonnegative(),
    sources: z.array(
      z.object({
        id: z.string(),
        provider: z.string().nullable(),
        externalId: z.string().nullable(),
        priority: z.number().int(),
      }),
    ),
  })
  .openapi("AdminMetaEvent");

const adminMetaEventListQuerySchema = z.object({
  search: z.string().optional(),
  format: z.string().optional(),
  source: z.enum(META_EVENT_SOURCE_FILTERS).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  incompleteStandings: z.coerce.boolean().optional(),
  noDecks: z.coerce.boolean().optional(),
  sort: z.enum(META_EVENT_SORTS).optional(),
  direction: z.enum(META_EVENT_SORT_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const adminMetaEventListResponseSchema = z
  .object({
    events: z.array(adminMetaEventSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .openapi("AdminMetaEventList");

/**
 * Mirrors the public event page's citation schema field for field: citations
 * are the credit line, not admin-only data.
 */
export const adminMetaEventSourceSchema = z
  .object({
    id: z.string(),
    provider: z.string().nullable(),
    externalId: z.string().nullable(),
    label: z.string(),
    sourceUrl: z.string().nullable(),
  })
  .openapi("AdminMetaEventSource");

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
const metaDeckCardSchema = z.object({
  cardId: z.uuid(),
  zone: deckZoneSchema,
  quantity: z.number().int().positive(),
  preferredPrintingId: z.uuid().nullable().optional(),
});

/** Free-form: the format owns the schema and the handler validates it. */
const formatConfigSchema = z.record(z.string(), z.unknown()).nullable();

const attachedListStatusSchema = metaListStatusSchema.exclude(["none"]);

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

const createMetaPlayerSchema = z.object({
  eventId: z.uuid(),
  ...playerScalarFields,
  list: metaPlayerListSchema.nullable().optional().default(null),
});

/**
 * Field-by-field correction: present is claimed, absent says nothing, null on
 * a nullable field clears it. `playerName: null` reverts to the source's name.
 */
const playerOverlayFieldsSchema = z
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
const playerOverlayListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  listStatus: attachedListStatusSchema.optional().default("full"),
});

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
const acceptClaimFields = z
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

/**
 * Ranked hints only: nothing links automatically, since a wrong link would
 * fold two unrelated tournaments into one page.
 */
export const metaEventMatchSuggestionSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    playerRowCount: z.number().int().nonnegative(),
    score: z.number(),
    reasons: z.array(z.string()),
    isExact: z.boolean(),
  })
  .openapi("MetaEventMatchSuggestion");

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

export const metaPlayerMatchSuggestionSchema = z
  .object({
    metaEventPlayerId: z.string(),
    playerName: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    deckId: z.string().nullable(),
    score: z.number(),
    reasons: z.array(z.string()),
    isCurrent: z.boolean(),
    isExact: z.boolean(),
  })
  .openapi("MetaPlayerMatchSuggestion");

/**
 * One standings row of a mirror the event cites but does not read, and the
 * live row the reviewer decided it is.
 */
export const metaCrossSourceRowSchema = z
  .object({
    provider: z.string(),
    sourceIdentity: z.string(),
    playerName: z.string(),
    rank: z.number().int(),
    legendName: z.string().nullable(),
    hasDeck: z.boolean(),
    state: z.enum(META_CROSS_SOURCE_STATES),
    metaEventPlayerId: z.string().nullable(),
    suggestions: z.array(metaPlayerMatchSuggestionSchema),
  })
  .openapi("MetaCrossSourceRow");

export const metaCrossSourceCitationSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    externalId: z.string(),
    contributes: z.boolean(),
  })
  .openapi("MetaCrossSourceCitation");

export const metaCrossSourceReviewSchema = z
  .object({
    sources: z.array(metaCrossSourceCitationSchema),
    rows: z.array(metaCrossSourceRowSchema),
  })
  .openapi("MetaCrossSourceReview");

/** Mounted under the Hono `requireAdmin`-gated prefix, so no handler here re-checks the role. */
export const adminMetaContract = {
  listEvents: authedRoute
    .route({ method: "GET", path: `${BASE}/events`, tags: [TAG] })
    .input(adminMetaEventListQuerySchema)
    .output(adminMetaEventListResponseSchema),

  getEvent: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}`, tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(adminMetaEventSchema),

  createEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/events`, tags: [TAG], successStatus: 201 })
    .input(eventBodySchema)
    .errors({
      CONFLICT: { message: "An event with that slug already exists" },
      BAD_REQUEST: { message: "Unknown deck format" },
    })
    .output(adminMetaEventSchema),

  /**
   * Only the slug: every other field goes through `writeEventOverlayFields`,
   * or a re-promote would silently revert the edit.
   */
  updateEvent: authedRoute
    .route({ method: "PATCH", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, z.object({ slug: eventSlugSchema })))
    .errors({
      NOT_FOUND: { message: "Event not found" },
      CONFLICT: { message: "An event with that slug already exists" },
    }),

  // `meta_event_players.deck_id` is ON DELETE RESTRICT: the row's decks are
  // cleared and deleted explicitly here.
  deleteEvent: authedRoute
    .route({ method: "DELETE", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } }),

  eventPlayers: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/players`, tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(z.object({ players: z.array(adminMetaPlayerSchema) })),

  createPlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/players`, tags: [TAG], successStatus: 201 })
    .input(createMetaPlayerSchema)
    .errors({
      NOT_FOUND: { message: "Event not found" },
      BAD_REQUEST: { message: "Unknown deck format" },
    })
    .output(
      z.object({
        metaEventPlayerId: z.string(),
        deckId: z.string().nullable(),
        shareToken: z.string().nullable(),
      }),
    ),

  /** Not an overlay: promotion never touches a deck's name once set, so a direct rename needs no claim. */
  renamePlayerDeck: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/players/{id}/deck-name`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema.extend({ name: z.string().trim().min(1).max(200) }))
    .errors({ NOT_FOUND: { message: "No deck on that standings row" } }),

  deletePlayer: authedRoute
    .route({ method: "DELETE", path: `${BASE}/players/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Standings row not found" } }),

  eventSources: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/sources`, tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(z.object({ sources: z.array(adminMetaEventSourceSchema) })),

  createEventSource: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/events/{id}/sources`,
      tags: [TAG],
      successStatus: 201,
    })
    // Strict: a body carrying `provider` / `externalId` fails validation.
    .input(
      withParams(idParamSchema, {
        label: z.string().trim().min(1).max(60),
        sourceUrl: z.string().trim().min(1).max(2000).nullable().optional().default(null),
      }).strict(),
    )
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(adminMetaEventSourceSchema),

  // Nested under the event, not a flat `/event-sources/{id}`: the handler
  // reads the event's citations anyway, to refuse a provider row before deleting it.
  deleteEventSource: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/events/{id}/sources/{sourceId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, { sourceId: z.uuid() }))
    .errors({
      NOT_FOUND: { message: "Citation not found" },
      CONFLICT: { message: "That citation belongs to a linked source" },
    }),
};

export type AdminMetaContract = typeof adminMetaContract;

export const adminMetaCandidatesContract = {
  upload: authedRoute
    .route({ method: "POST", path: `${BASE}/upload`, tags: [OVERLAY_TAG] })
    .input(metaUploadSchema)
    .output(metaUploadResponseSchema),

  list: authedRoute
    .route({ method: "GET", path: `${BASE}/overlays`, tags: [OVERLAY_TAG] })
    .output(z.object({ overlays: z.array(metaOverlayQueueRowSchema) })),

  detail: authedRoute
    .route({ method: "GET", path: `${BASE}/overlays/{id}`, tags: [OVERLAY_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Overlay not found" } })
    .output(metaOverlayDetailSchema),

  drift: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/drift`, tags: [OVERLAY_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaEventDriftSchema),

  /** Only send fields the admin actually changed — claiming every field would behave like disabling every source. */
  writeEventOverlayFields: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/overlays`, tags: [OVERLAY_TAG] })
    .input(
      idParamSchema.extend({
        edits: z
          .array(
            z.object({
              field: z.enum(META_EVENT_OVERLAY_FIELDS),
              value: z.string().nullable(),
            }),
          )
          .min(1)
          .max(META_EVENT_OVERLAY_FIELDS.length),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Event not found" },
      BAD_REQUEST: { message: "That value is not valid for this field" },
    })
    .output(metaOverlayReviewResultSchema),

  /** Every accepted overlay claiming this field loses the claim, so the next promote lets a source decide it again. */
  releaseEventOverlayField: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/overlays/release`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ field: z.enum(META_EVENT_OVERLAY_FIELDS) }))
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaOverlayReviewResultSchema),

  /**
   * Mirrors `writeEventOverlayFields` for a standings row. `list`: absent says
   * nothing, an object claims a list, null claims there is none.
   */
  writePlayerOverlayFields: authedRoute
    .route({ method: "POST", path: `${BASE}/players/{id}/overlays`, tags: [OVERLAY_TAG] })
    .input(
      idParamSchema.extend({
        fields: playerOverlayFieldsSchema.optional(),
        list: playerOverlayListSchema.nullable().optional(),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Standings row not found" },
      BAD_REQUEST: { message: "That value is not valid for this field" },
    })
    .output(metaOverlayReviewResultSchema),

  /** Releasing `cards` or `listStatus` releases both: a list and its status can never disagree. */
  releasePlayerOverlayField: authedRoute
    .route({ method: "POST", path: `${BASE}/players/{id}/overlays/release`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ field: z.enum(META_PLAYER_OVERLAY_FIELDS) }))
    .errors({ NOT_FOUND: { message: "Standings row not found" } })
    .output(metaOverlayReviewResultSchema),

  setSourcePriority: authedRoute
    .route({ method: "POST", path: `${BASE}/event-sources/{id}/priority`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ priority: z.number().int().min(0).max(999) }))
    .errors({ NOT_FOUND: { message: "Source not found" } })
    .output(z.void()),

  resolveName: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/resolve-name`, tags: [OVERLAY_TAG] })
    .input(z.object({ name: z.string().min(1).max(200), cardId: z.uuid() }))
    .output(z.object({ updated: z.number().int().nonnegative() })),

  /** `metaEventId` accepts the proposal into an event the archive already has; null mints a new one. */
  acceptEventOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/events/{id}/accept`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ metaEventId: z.string().nullable().optional().default(null) }))
    .errors({
      NOT_FOUND: { message: "Overlay not found" },
      BAD_REQUEST: { message: "A proposed event needs a name, a date and a format" },
      CONFLICT: { message: "Could not mint a free slug" },
    })
    .output(metaOverlayReviewResultSchema),

  moveEventOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/events/{id}/move`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ metaEventId: z.string() }))
    .errors({
      NOT_FOUND: { message: "Overlay or archived event not found" },
      BAD_REQUEST: { message: "Only a provider's upload can be moved" },
    })
    .output(metaOverlayReviewResultSchema),

  /** `fields` narrows what the accept keeps — see {@link acceptClaimFields}. */
  acceptPlayerOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/players/{id}/accept`, tags: [OVERLAY_TAG] })
    .input(
      idParamSchema.extend({
        metaEventPlayerId: z.string().nullable().optional().default(null),
        fields: acceptClaimFields,
      }),
    )
    .errors({
      NOT_FOUND: { message: "Overlay or standings row not found" },
      CONFLICT: { message: "Accept the event first" },
      BAD_REQUEST: { message: "An accept that keeps no claim is a reject" },
    })
    .output(metaOverlayReviewResultSchema),

  /** All-or-nothing: nothing is written when any item is refused. */
  acceptPlayerOverlays: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/players/accept`, tags: [OVERLAY_TAG] })
    .input(
      z.object({
        items: z
          .array(
            z.object({
              id: z.string(),
              metaEventPlayerId: z.string().nullable().optional().default(null),
              fields: acceptClaimFields,
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Overlay or standings row not found" },
      CONFLICT: { message: "Accept the event first" },
      BAD_REQUEST: { message: "An accept that keeps no claim is a reject" },
    })
    .output(metaOverlayBulkAcceptResultSchema),

  linkPlayerOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/players/{id}/link`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ metaEventPlayerId: z.string() }))
    .errors({ NOT_FOUND: { message: "Overlay or standings row not found" } })
    .output(metaOverlayReviewResultSchema),

  rejectOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/{kind}/{id}/reject`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ kind: z.enum(["event", "player"]) }))
    .errors({ NOT_FOUND: { message: "Overlay not found" } })
    .output(metaOverlayReviewResultSchema),

  eventUploads: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/uploads`, tags: [OVERLAY_TAG] })
    .input(idParamSchema)
    .output(z.object({ uploads: z.array(metaUploadSummarySchema) })),

  /** Rejects an upload's event overlay and every standings overlay it wrote; nothing is deleted. */
  revertUpload: authedRoute
    .route({ method: "POST", path: `${BASE}/uploads/revert`, tags: [OVERLAY_TAG] })
    .input(z.object({ provider: z.string().min(1), externalId: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "No upload with that source key" } })
    .output(metaUploadRevertResultSchema),

  ignoreEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/source-events/ignore`, tags: [OVERLAY_TAG] })
    .input(z.object({ provider: z.string().min(1), externalId: z.string().min(1) }))
    .output(z.void()),

  ignorePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/source-players/ignore`, tags: [OVERLAY_TAG] })
    .input(
      z.object({
        provider: z.string().min(1),
        eventExternalId: z.string().min(1),
        externalId: z.string().min(1),
      }),
    )
    .output(z.void()),

  listIgnored: authedRoute
    .route({ method: "GET", path: `${BASE}/ignored`, tags: [OVERLAY_TAG] })
    .output(
      z.object({
        events: z.array(
          z.object({ provider: z.string(), externalId: z.string(), createdAt: isoDateTime }),
        ),
        players: z.array(
          z.object({
            provider: z.string(),
            eventExternalId: z.string(),
            externalId: z.string(),
            createdAt: isoDateTime,
          }),
        ),
      }),
    ),

  unignoreEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/source-events/unignore`, tags: [OVERLAY_TAG] })
    .input(z.object({ provider: z.string().min(1), externalId: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not on the ignore list" } })
    .output(z.void()),

  unignorePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/source-players/unignore`, tags: [OVERLAY_TAG] })
    .input(
      z.object({
        provider: z.string().min(1),
        eventExternalId: z.string().min(1),
        externalId: z.string().min(1),
      }),
    )
    .errors({ NOT_FOUND: { message: "Not on the ignore list" } })
    .output(z.void()),

  eventMatchSuggestions: authedRoute
    .route({
      method: "GET",
      path: `${BASE}/overlays/events/{id}/match-suggestions`,
      tags: [OVERLAY_TAG],
    })
    .input(idParamSchema)
    .output(
      z.object({
        suggestions: z.array(metaEventMatchSuggestionSchema),
        windowDays: z.number().int().positive(),
      }),
    ),

  playerMatchSuggestions: authedRoute
    .route({
      method: "GET",
      path: `${BASE}/overlays/players/{id}/match-suggestions`,
      tags: [OVERLAY_TAG],
    })
    .input(idParamSchema)
    .output(z.object({ suggestions: z.array(metaPlayerMatchSuggestionSchema) })),

  /** Empty for the ordinary event, which only one mirror describes. */
  crossSourceReview: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/cross-source`, tags: [OVERLAY_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaCrossSourceReviewSchema),

  /**
   * A null `metaEventPlayerId` says the entry is nobody the event lists.
   * Plural so a whole field of exact matches re-promotes the event once,
   * not once per decision.
   */
  linkCrossSourcePlayers: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/cross-source/link`, tags: [OVERLAY_TAG] })
    .input(
      withParams(idParamSchema, {
        links: z
          .array(
            z.object({
              provider: z.string().min(1),
              sourceIdentity: z.string().min(1),
              metaEventPlayerId: z.string().nullable(),
            }),
          )
          .min(1)
          .max(1000),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Standings row not found" },
      CONFLICT: { message: "That entry, or that standings row, is already spoken for" },
    })
    .output(z.void()),

  /** Refused while the source is read: promotion folds on the link and would mint a duplicate row without it. */
  unlinkCrossSourcePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/cross-source/unlink`, tags: [OVERLAY_TAG] })
    .input(
      withParams(idParamSchema, {
        provider: z.string().min(1),
        sourceIdentity: z.string().min(1),
      }),
    )
    .errors({
      NOT_FOUND: { message: "That entry has not been reviewed" },
      CONFLICT: { message: "Stop reading this source before revising its links" },
    })
    .output(z.void()),

  /** Turning it on is refused while any entry is undecided, since promotion would then archive someone twice. */
  setSourceContributes: authedRoute
    .route({ method: "POST", path: `${BASE}/event-sources/{id}/contributes`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ contributes: z.boolean() }))
    .errors({
      NOT_FOUND: { message: "Citation not found" },
      BAD_REQUEST: { message: "That citation has no standings to contribute" },
      CONFLICT: { message: "Some entries are not linked yet" },
    })
    .output(z.void()),
};

export type AdminMetaCandidatesContract = typeof adminMetaCandidatesContract;
