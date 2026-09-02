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
  META_EVENT_OVERLAY_FIELDS,
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
  META_EVENT_SOURCE_FILTERS,
  META_PLAYER_OVERLAY_FIELDS,
} from "../../types/enums.js";
import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta archive";
const OVERLAY_TAG = "Admin - Meta overlays";
const BASE = "/api/admin/v1/meta";

/**
 * Slugs the `/meta` route space already spends on its own pages. An event
 * claiming one would be shadowed by the static route and never reachable, so
 * they are rejected at the contract boundary rather than left to produce a
 * confusing 404 later. Add a name here whenever `/meta` gains a static child.
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
  // No `sourceUrl` (migration 255): attribution is the event's citation list,
  // written through the source endpoints below and by linking a candidate.
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
    /** Standings rows the archive holds, decks and deckless entries alike. */
    playerRowCount: z.number().int().nonnegative(),
    /** The subset of those rows with a decklist attached. */
    deckCount: z.number().int().nonnegative(),
    /** The mirrors feeding this event, in promotion order. */
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
  /** Matched against the event name and the organizer. */
  search: z.string().optional(),
  /** A `deck_formats` slug. */
  format: z.string().optional(),
  /** A provider that feeds the event, or `manual` for events no provider feeds. */
  source: z.enum(META_EVENT_SOURCE_FILTERS).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  /** True keeps only events holding fewer standings rows than the reported field. */
  incompleteStandings: z.coerce.boolean().optional(),
  /** True keeps only events where no standings row carries a decklist. */
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
 * One citation on an event, as the admin table lists it. Same row the public
 * event page prints — citations are not admin data, they are the credit line —
 * so this mirrors `metaEventSourceSchema` field for field.
 */
export const adminMetaEventSourceSchema = z
  .object({
    id: z.string(),
    /** Null together with `externalId` for a hand-entered citation. */
    provider: z.string().nullable(),
    externalId: z.string().nullable(),
    label: z.string(),
    sourceUrl: z.string().nullable(),
  })
  .openapi("AdminMetaEventSource");

/**
 * One standings row in the event's management table. The deck fields are all
 * null together for an entry the archive knows no list for, which is most of a
 * real event's field.
 */
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
    /** The deck's permalink slug; null together with `deckId`. */
    shareToken: z.string().nullable(),
    deckName: z.string().nullable(),
    deckFormat: deckFormatSchema.nullable(),
    cardCount: z.number().int().nonnegative(),
    /** Fields accepted overlays own for this row; the sources no longer decide them. */
    claimedFields: z.array(z.string()),
  })
  .openapi("AdminMetaPlayer");

/**
 * Structured card rows, not a deck code: the admin client parses whatever it
 * was pasted (deck code, text list) and sends the resolved cards, so the API
 * never owns a second parser.
 */
const metaDeckCardSchema = z.object({
  cardId: z.uuid(),
  zone: deckZoneSchema,
  quantity: z.number().int().positive(),
  preferredPrintingId: z.uuid().nullable().optional(),
});

/**
 * Free-form per-deck format config, same loose shape the user-facing deck
 * contract uses: the format owns the schema and the handler validates it.
 */
const formatConfigSchema = z.record(z.string(), z.unknown()).nullable();

/** A list status a deck can actually hold — `"none"` means there is no deck. */
const attachedListStatusSchema = metaListStatusSchema.exclude(["none"]);

/**
 * The decklist attached to a standings row. Present creates or replaces the
 * archived deck (and mints its permalink); absent leaves the row standings-only.
 */
const metaPlayerListSchema = z.object({
  name: z.string().min(1).max(200),
  format: z.string().min(1),
  formatConfig: formatConfigSchema.optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  /**
   * `"partial"` means the main deck is complete and the side zones may be
   * missing; it counts as a list everywhere a full one does.
   */
  listStatus: attachedListStatusSchema.optional().default("full"),
});

const playerScalarFields = {
  playerName: z.string().min(1).max(80),
  rank: z.number().int().min(1),
  /** True when `rank` is a cut bucket ("T8") rather than an exact standing. */
  rankIsTier: z.boolean().optional().default(false),
  wins: z.number().int().min(0).nullable().optional().default(null),
  losses: z.number().int().min(0).nullable().optional().default(null),
  draws: z.number().int().min(0).nullable().optional().default(null),
  /**
   * The legend the player played, which the archive knows for nearly every entry
   * whether or not a list was published. Ignored when `list` is given: the
   * deck's own legend zone wins there.
   */
  legendCardId: z.uuid().nullable().optional().default(null),
  championCardId: z.uuid().nullable().optional().default(null),
};

const createMetaPlayerSchema = z.object({
  eventId: z.uuid(),
  ...playerScalarFields,
  list: metaPlayerListSchema.nullable().optional().default(null),
});

/**
 * A standings-row correction, claimed field by field: a present key is
 * claimed, an absent one says nothing, and a null on a nullable field clears
 * it. `playerName: null` hands a source-keyed row back to the source's
 * renames.
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

/**
 * The list an admin's overlay claims. No `format`: an archived deck's format
 * is the event's, which promotion owns. `name` is not overlay data either —
 * promotion preserves deck renames — so it is applied as a direct rename of
 * the derived deck after the promote.
 */
const playerOverlayListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  listStatus: attachedListStatusSchema.optional().default("full"),
});

// ── Candidate ingest (ADR-014) ───────────────────────────────────────────────
// Wire validation here is deliberately lenient, exactly as the card pipeline's
// upload is: value constraints are checked per item inside the ingest service so
// one malformed event or player skips with a reported reason instead of 400-ing
// the whole batch. Bounds, zone vocabulary, and date validity all live there.

/**
 * Absent, null, `""`, and whitespace-only all mean "the source didn't give us
 * this". Scrapers routinely emit `""` for a field they found no value for, and
 * the live columns CHECK a minimum length, so folding it here is what keeps an
 * otherwise fine event from being skipped with a bounds complaint.
 */
const nullStr = z
  .string()
  .nullable()
  .optional()
  .default(null)
  .transform((value) => (value === null || value.trim() === "" ? null : value));

const nullNum = z.number().nullable().optional().default(null);

const uploadDeckCardSchema = z.object({
  /** The card name as the source wrote it; matched through the shared alias index. */
  name: z.string(),
  zone: z.string(),
  quantity: z.number(),
});

/**
 * One player of an uploaded event. The list is optional and usually absent: the
 * official source publishes the whole field's records for every event and a
 * decklist for almost none.
 *
 * `listStatus` and `cards` have to agree, so the transform below settles it
 * rather than letting a producer claim a completeness its payload contradicts:
 * cards present defaults to `"full"` and may say `"partial"`, cards absent is
 * `"none"` and may say nothing else. An empty `cards` array is read as absent —
 * "no list" and "a list of nothing" are the same claim.
 */
const uploadPlayerSchema = z
  .object({
    externalId: z.string(),
    playerName: z.string(),
    rank: z.number(),
    rankIsTier: z.boolean().optional().default(false),
    wins: nullNum,
    losses: nullNum,
    draws: nullNum,
    /**
     * The standings columns behind the rank. Producers that publish only a
     * placement omit them, which is most of them; the official source fills all
     * four. `entryStatus` is checked against its vocabulary in the service,
     * like every other value constraint here.
     */
    matchPoints: nullNum,
    opponentMatchWinPct: nullNum,
    gameWinPct: nullNum,
    opponentGameWinPct: nullNum,
    entryStatus: nullStr,
    /** Resolved through the same alias index as the card lines. */
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
  /** Null when the producer classified nothing; the accept classifies then. */
  tier: nullStr,
  country: nullStr,
  location: nullStr,
  /** Source fields that map to nothing of ours, kept verbatim. */
  extraData: z.unknown().nullable().optional().default(null),
  players: z.array(uploadPlayerSchema).optional().default([]),
});

export const metaUploadSchema = z.object({
  // Trimmed and bounded here rather than in the service: the provider names the
  // whole batch, so a blank one is a 400 on the request, not a per-item skip.
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
    /** Events and players whose key is on an ignore list. */
    ignoredSkipped: z.number().int(),
    /** One line per dropped duplicate and per item that failed validation. */
    errors: z.array(z.string()),
    newEventDetails: z.array(uploadEventDetailSchema),
    updatedEventDetails: z.array(uploadEventDetailSchema),
    unresolvedCards: z.array(uploadUnresolvedSchema),
  })
  .openapi("MetaUploadResponse");

/**
 * One claimed field, with the value the overlay sets and what live holds today.
 *
 * `to` is nullable because clearing a field is a legitimate claim: the mask is
 * what distinguishes "set this to nothing" from "say nothing about this", and
 * this schema carries both sides so a reviewer sees the change, not just the
 * new value.
 */
const metaOverlayFieldChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

/** One line of a submitted decklist. `cardId` is null while the name matches nothing. */
const metaOverlayCardSchema = z.object({
  lineNumber: z.number().int().nonnegative(),
  zone: z.string(),
  quantity: z.number().int().positive(),
  cardName: z.string(),
  cardId: z.string().nullable(),
});

export const metaOverlayQueueRowSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["event", "player"]),
    status: metaOverlayStatusSchema,
    /** The push provider that wrote this overlay; null for people. */
    provider: z.string().nullable(),
    /**
     * The provider's own event key (event rows) or the key of the event a
     * pushed player row belongs to. With `provider`, this is what a dismiss
     * takes; null for people.
     */
    sourceEventExternalId: z.string().nullable(),
    /** The provider's own key for a pushed standings row. See above; null for people. */
    sourcePlayerExternalId: z.string().nullable(),
    /** Null on a proposal, which has no live row to patch yet. */
    metaEventId: z.string().nullable(),
    /** The standings row a player overlay is anchored to; null while loose. */
    metaEventPlayerId: z.string().nullable(),
    metaEventName: z.string().nullable(),
    /** What the submitter called the event, so a proposal still reads. */
    proposedName: z.string().nullable(),
    playerName: z.string().nullable(),
    submittedBy: z.string().nullable(),
    submissionNote: z.string().nullable(),
    changes: z.array(metaOverlayFieldChangeSchema),
    /** Card lines this overlay claims, empty unless it claims `cards`. */
    cards: z.array(metaOverlayCardSchema),
    /** Names in {@link cards} that resolve to nothing, deduplicated. */
    unresolvedNames: z.array(z.string()),
    createdAt: isoDateTime,
  })
  .openapi("MetaOverlayQueueRow");

export const metaOverlayDetailSchema = metaOverlayQueueRowSchema.openapi("MetaOverlayDetail");

export const metaOverlayReviewResultSchema = z
  .object({
    metaEventId: z.string().nullable(),
    /** True when accepting a proposal minted the live event. */
    created: z.boolean(),
  })
  .openapi("MetaOverlayReviewResult");

/**
 * One field of the drift view: what each linked mirror published for it, and
 * what live shows.
 *
 * `claimedByOverlay` is why a field can disagree with every source and still be
 * correct: an accepted overlay owns it, so promotion no longer lets a source
 * win it. The UI greys the source cells rather than flagging them as conflicts.
 */
const metaEventDriftFieldSchema = z.object({
  field: z.string(),
  live: z.string().nullable(),
  /**
   * One entry per linked source, in the same order as
   * {@link metaEventDriftSchema.sources}. `value` is what promotion would use;
   * `raw` is the source's own term where the projection rewrote it, so a
   * reviewer can tell a mapping from a source's own words. Null when the
   * projection passed the value through unchanged.
   */
  bySource: z.array(z.object({ value: z.string().nullable(), raw: z.string().nullable() })),
  claimedByOverlay: z.boolean(),
  /**
   * The source the live value came from, or null when no source published it
   * (a hand-entered value) or an overlay owns the field.
   */
  wonBy: z.string().nullable(),
});

export const metaEventDriftSchema = z
  .object({
    metaEventId: z.string(),
    /** The linked mirrors, in promotion order: the last one wins a contested field. */
    sources: z.array(
      z.object({
        id: z.string(),
        provider: z.string().nullable(),
        externalId: z.string().nullable(),
        label: z.string(),
        priority: z.number().int(),
        /** False when the provider has no crawler, so nothing promotes from it. */
        hasMirror: z.boolean(),
      }),
    ),
    fields: z.array(metaEventDriftFieldSchema),
  })
  .openapi("MetaEventDrift");

/**
 * One live event a proposed overlay might duplicate, with the signals behind
 * its rank. Ranked hints only — nothing is ever linked automatically, because a
 * wrong link fans two unrelated tournaments into one page.
 */
export const metaEventMatchSuggestionSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    playerRowCount: z.number().int().nonnegative(),
    /** Higher is better. Comparable only within one response. */
    score: z.number(),
    /** Why it ranked, in the order the signals were weighed. */
    reasons: z.array(z.string()),
  })
  .openapi("MetaEventMatchSuggestion");

/** One live standings row an unanchored player overlay might describe, inside its event. */
export const metaPlayerMatchSuggestionSchema = z
  .object({
    metaEventPlayerId: z.string(),
    playerName: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    /** The row's deck, when it already has one. */
    deckId: z.string().nullable(),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi("MetaPlayerMatchSuggestion");

/**
 * oRPC contract for curating the meta archive (ADR-014), mounted under
 * `/api/admin/v1/meta` — the prefix the Hono `requireAdmin` middleware gates,
 * so no handler re-checks the role. Full admin only: the archive is not a
 * grantable section.
 *
 * The unit of curation is a standings row, not a deck: `meta_event_players`
 * holds one row per player and a decklist is an optional attachment to it, so
 * the write verbs create and edit players and pass a list along when there is
 * one.
 *
 * Domain codes: `createEvent` → CONFLICT (slug taken); `updateEvent`,
 * `deleteEvent`, `eventPlayers`, `createPlayer`, `deletePlayer`,
 * `eventSources`, `createEventSource`, `deleteEventSource` → NOT_FOUND;
 * `updateEvent` also CONFLICT when a rename collides; `deleteEventSource` also
 * CONFLICT for a provider citation, which is owned by its candidate's link.
 *
 * Citations replaced the single `source_url` column (migration 255). Only
 * hand-entered ones are created here; a provider's row is written when its
 * event is accepted into the archive.
 *
 * `deleteEvent` removes the underlying `decks` rows too. The player rows cascade
 * from the event, but `meta_event_players.deck_id` is ON DELETE RESTRICT, so the
 * decks are cleared and deleted explicitly rather than stranded under the
 * synthetic owner.
 */
export const adminMetaContract = {
  listEvents: authedRoute
    .route({ method: "GET", path: `${BASE}/events`, tags: [TAG] })
    .input(adminMetaEventListQuerySchema)
    .output(adminMetaEventListResponseSchema),

  /**
   * One event on its own. The list is paged, so nothing can resolve an event by
   * scanning it: the standings page and the review screens each read the
   * single row they are about through here.
   */
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
   * Renames an event's slug, and nothing else: every data field is corrected
   * through `writeEventOverlayFields`, so a re-promote can never silently
   * revert an admin's edit. The slug is identity rather than data — no source
   * publishes one, so it has no overlay to claim.
   */
  updateEvent: authedRoute
    .route({ method: "PATCH", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, z.object({ slug: eventSlugSchema })))
    .errors({
      NOT_FOUND: { message: "Event not found" },
      CONFLICT: { message: "An event with that slug already exists" },
    }),

  deleteEvent: authedRoute
    .route({ method: "DELETE", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } }),

  /**
   * Promotion run again over every event: the tier and country rules live
   * there, and an accepted overlay still wins whatever it claims. This is how
   * a rule change in code reaches rows classified under the old rules.
   */
  reclassifyEvents: authedRoute
    .route({ method: "POST", path: `${BASE}/events/reclassify`, tags: [TAG] })
    .output(
      z
        .object({
          /** Events promotion ran over again. */
          events: z.number().int().nonnegative(),
          /** Of those, how many reported a problem. */
          failed: z.number().int().nonnegative(),
          errors: z.array(z.string()),
        })
        .openapi("MetaRepromoteResult"),
    ),

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
    // `deckId` and `shareToken` are null together when no list was supplied.
    .output(
      z.object({
        metaEventPlayerId: z.string(),
        deckId: z.string().nullable(),
        shareToken: z.string().nullable(),
      }),
    ),

  /**
   * Renames a standings row's archived deck. Not an overlay: the deck's name
   * is the archive's own derived artifact, promotion preserves whatever name
   * is already there, so a direct rename is durable and needs no claim.
   */
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
    // Strict, so a body carrying `provider` / `externalId` fails validation
    // instead of being silently stripped.
    .input(
      withParams(idParamSchema, {
        label: z.string().trim().min(1).max(60),
        sourceUrl: z.string().trim().min(1).max(2000).nullable().optional().default(null),
      }).strict(),
    )
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(adminMetaEventSourceSchema),

  // Nested under the event rather than a flat `/event-sources/{id}`: the
  // handler has to read the event's citations anyway, to refuse a provider row
  // before deleting it.
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

/**
 * The overlay queue and the drift view (ADR-014 revision 3), on the
 * admin-gated `/api/admin/v1/meta` prefix.
 *
 * Two things need reviewing and they are deliberately not the same screen.
 * **Drift** is a read: it shows each linked mirror beside the live row so the
 * admin can see where they disagree. Its only writes are a source's priority
 * and an overlay claiming a field. **The queue** is the pending overlays, which
 * accept or reject settles.
 *
 * There is no per-cell accept. Taking one source's value for one field is
 * exactly what an overlay is, and a second way to spell that is a second thing
 * to keep consistent. Linking is `meta_event_sources`, not a candidate FK, so
 * the link/relink/unlink trio is gone with it.
 *
 * Domain codes: `acceptEventOverlay` → NOT_FOUND for an unknown id,
 * BAD_REQUEST when a proposal names no event, CONFLICT when no free slug could
 * be minted. `acceptPlayerOverlay` → CONFLICT while its event is still only
 * proposed. `reject` → NOT_FOUND.
 */
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

  /**
   * The admin's correction path: claim event fields for the archive.
   *
   * Corrections are born accepted, so this writes the overlay and re-promotes
   * in one call. One admin's edits on one event merge into a single overlay
   * row; different submitters keep separate rows. Claiming every field at once
   * would be indistinguishable from turning the sources off, which is what
   * source priority is for — so callers send only the fields the admin
   * actually changed.
   */
  writeEventOverlayFields: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/overlays`, tags: [OVERLAY_TAG] })
    .input(
      idParamSchema.extend({
        edits: z
          .array(
            z.object({
              field: z.enum(META_EVENT_OVERLAY_FIELDS),
              /** Null clears the field, which the mask makes expressible. */
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

  /**
   * Hands one field back to the sources: every accepted overlay claiming it
   * loses the claim, and the next promote lets the winning source decide it
   * again.
   */
  releaseEventOverlayField: authedRoute
    .route({ method: "POST", path: `${BASE}/events/{id}/overlays/release`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ field: z.enum(META_EVENT_OVERLAY_FIELDS) }))
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaOverlayReviewResultSchema),

  /**
   * The admin's correction path for a standings row, mirroring
   * `writeEventOverlayFields`: one merged accepted overlay per (row, author),
   * present keys claimed, re-promoted in the same call. `list` distinguishes
   * absent (say nothing), an object (claim this list) and null (claim that
   * there is no list).
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

  /**
   * See `releaseEventOverlayField`. Releasing `cards` or `listStatus` releases
   * both: a list and its status can never disagree, so they claim and release
   * as one.
   */
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

  /**
   * `metaEventId` accepts a proposal into an event the archive already has —
   * the reviewer acting on a match suggestion — instead of minting a
   * duplicate. Ignored for an overlay that already patches a live event.
   */
  acceptEventOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/events/{id}/accept`, tags: [OVERLAY_TAG] })
    .input(idParamSchema.extend({ metaEventId: z.string().nullable().optional().default(null) }))
    .errors({
      NOT_FOUND: { message: "Overlay not found" },
      BAD_REQUEST: { message: "A proposed event needs a name, a date and a format" },
      CONFLICT: { message: "Could not mint a free slug" },
    })
    .output(metaOverlayReviewResultSchema),

  acceptPlayerOverlay: authedRoute
    .route({ method: "POST", path: `${BASE}/overlays/players/{id}/accept`, tags: [OVERLAY_TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Overlay not found" },
      CONFLICT: { message: "Accept the event first" },
    })
    .output(metaOverlayReviewResultSchema),

  /**
   * Anchors a standings overlay to the live row it describes — the reviewer
   * acting on a player match suggestion. An already-accepted overlay lands on
   * the row immediately.
   */
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
        /**
         * How many days apart two events may be and still be offered as one
         * tournament. Travels so an empty list can say why ("no events within
         * 3 days") instead of just being empty.
         */
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
};

export type AdminMetaCandidatesContract = typeof adminMetaCandidatesContract;
