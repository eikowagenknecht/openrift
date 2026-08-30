import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  metaEventTierSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { isoDate } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicDeckDetailResponseSchema } from "./public-decks.js";

extendZodWithOpenApi(z);

const TAG = "Meta archive";
const BASE = "/api/v1/meta";

/**
 * A legend or champion as a standings row names it: denormalized so the event
 * page and deck browser render without pulling the catalog.
 */
export const metaCardRefSchema = z
  .object({
    cardId: z.string(),
    name: z.string(),
    slug: z.string(),
    /** Canonical front image, null when the card has no usable artwork. */
    imageId: z.string().nullable(),
    /**
     * Domain slugs for the runes an archive surface draws beside the name.
     * Empty when the aggregates view has not caught up with a freshly imported
     * card, which renders the name without runes rather than blocking the row.
     */
    domains: z.array(z.string()),
    /**
     * The key this card answers to at `/meta/legends/{slug}`, or null when it
     * has no such page — a champion ref never has one.
     *
     * Composed once here rather than at each call site: the key needs the
     * champion tag, and a surface holding only a display name cannot tell a
     * legend's composed name from a champion unit's printed one. Deriving it in
     * a component therefore produced a link to a page that does not exist.
     */
    archiveSlug: z.string().nullable(),
  })
  .openapi("MetaCardRef");

/**
 * Who won one archived event: a rank-1 standings row, as an event list prints it
 * inline. One published result, not a computed standing — an event whose
 * standings the archive does not hold has no winner rather than a guessed one,
 * and a source that published two first places gets both named.
 */
export const metaEventWinnerSchema = z
  .object({
    playerName: z.string(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legend: metaCardRefSchema.nullable(),
  })
  .openapi("MetaEventWinner");

/** An event as it appears in a list: enough for a row, without the long-form fields. */
export const metaEventSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: deckFormatSchema,
    /** How much the event counts for, in the archive's own vocabulary rather than the source's product names. */
    tier: metaEventTierSchema,
    /** ISO 3166-1 alpha-2 of the venue, null when no source told us. */
    country: z.string().nullable(),
    /** The venue address as the source published it. */
    location: z.string().nullable(),
    /** What the source reported the field size as, which can exceed the rows we hold. */
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    /** Standings rows the archive holds, decks and deckless entries alike. */
    playerRowCount: z.number().int().nonnegative(),
    /** The subset of those rows with a decklist attached. */
    deckCount: z.number().int().nonnegative(),
    /** Every rank-1 finish the archive holds, empty until standings are archived. */
    winners: z.array(metaEventWinnerSchema),
  })
  .openapi("MetaEventSummary");

/**
 * One citation on an event: where a slice of its data came from (ADR-014,
 * migration 255). Public, and never a contributor — a person is credited
 * through the event's `contributors` line instead.
 *
 * `provider` and `externalId` are null together for a hand-entered citation (a
 * VOD, a photo of the standings board). They travel on the public payload
 * because neither is a secret and the admin review screen keys its source
 * columns on them.
 */
export const metaEventSourceSchema = z
  .object({
    id: z.string(),
    provider: z.string().nullable(),
    externalId: z.string().nullable(),
    /** What the page prints, e.g. "uvsgames" or "Twitch VOD". */
    label: z.string(),
    sourceUrl: z.string().nullable(),
  })
  .openapi("MetaEventSource");

/**
 * The summary plus the fields only the event's own page renders.
 *
 * `sourceUrl` is gone (migration 255): one column held one link, and an event
 * fed by two sources owes both a credit. `sources` is that list, in a stable
 * order (provider citations first, then oldest first).
 *
 * `contributors` are display names already resolved and already filtered:
 * anyone whose `meta_credit_visibility` is `hidden`, and anyone whose chosen
 * profile field is blank, is absent from the array entirely. Plain text with no
 * profile link behind it, because linking a credit to a profile is a separate
 * consent question.
 */
export const metaEventDetailSchema = metaEventSummarySchema
  .extend({
    notes: z.string().nullable(),
    sources: z.array(metaEventSourceSchema),
    contributors: z.array(z.string()),
  })
  .openapi("MetaEventDetail");

/** The event fields carried alongside every deck, so a deck row renders its byline standalone. */
const metaDeckEventSchema = z.object({
  slug: z.string(),
  name: z.string(),
  eventDate: isoDate,
  format: deckFormatSchema,
});

/**
 * One player's entry in an event's standings. Every archived event has the whole
 * field here, not only the players whose decklists were published: `deckId` and
 * `shareToken` are set exactly for the entries a list is known for, and
 * `listStatus` is `"none"` for the rest.
 *
 * `rankIsTier` says how to print `rank`: an exact final standing renders "8th",
 * a source that only publishes cut buckets renders "T8".
 */
export const metaEventPlayerSchema = z
  .object({
    id: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legend: metaCardRefSchema.nullable(),
    champion: metaCardRefSchema.nullable(),
    /** Null for a standings-only entry, which has no page. */
    deckId: z.string().nullable(),
    /** The deck's display name; null together with {@link deckId}. */
    deckName: z.string().nullable(),
    /** The public permalink slug — `decks.share_token`. Null together with {@link deckId}. */
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
  })
  .openapi("MetaEventPlayer");

/**
 * One stage of an event: the Swiss rounds, then the cut. This is what tells a
 * cut apart from the rounds before it — the match rows carry only a
 * `phaseOrder`, and guessing a bracket from the shape of its rounds gets a
 * bronze match or a thinning Swiss wrong.
 */
export const metaEventPhaseSchema = z
  .object({
    phaseOrder: z.number().int(),
    /** The source's own name for the phase, e.g. "Phase 2". */
    name: z.string().nullable(),
    /** Source vocabulary, kept raw: `SWISS`, `RANKED_SINGLE_ELIMINATION`. */
    roundType: z.string(),
    roundCount: z.number().int().nullable(),
    /** The standing that entered this phase — 8 for a Top 8. */
    rankRequired: z.number().int().nullable(),
  })
  .openapi("MetaEventPhase");

/**
 * One archived match in one round, referencing the event's player rows by id.
 * Per-match facts only; no aggregate is computed or served from these.
 */
export const metaEventMatchSchema = z
  .object({
    /** Position of the round's phase (Day 1, Day 2, top cut). */
    phaseOrder: z.number().int(),
    roundNumber: z.number().int(),
    /** Null on byes. */
    tableNumber: z.number().int().nullable(),
    isBye: z.boolean(),
    isDraw: z.boolean(),
    /** Ids from this event's `players` array. */
    player1Id: z.string(),
    /** Null exactly on a bye. */
    player2Id: z.string().nullable(),
    /** One of the participants; null on a draw or an unreported result. */
    winnerId: z.string().nullable(),
    gamesWonP1: z.number().int().nullable(),
    gamesWonP2: z.number().int().nullable(),
  })
  .openapi("MetaEventMatch");

/**
 * One archived deck as a tile or table row in the cross-event browser. Only
 * standings rows that carry a list appear here, so `deckId` and `shareToken`
 * are always set.
 *
 * Legend and champion are denormalized (id, name, canonical front image) so the
 * browser SSRs without pulling the catalog. Both are nullable: nothing forces an
 * admin-entered deck to fill either zone.
 */
export const metaDeckSummarySchema = z
  .object({
    /** The `meta_event_players` row this deck hangs off. */
    playerId: z.string(),
    deckId: z.string(),
    /** The public permalink slug — `decks.share_token`, not a second column. */
    shareToken: z.string(),
    /**
     * How much of the player's list the archive holds. Never `"none"` here: an
     * entry with no list has no deck to browse. `"partial"` is worth labelling
     * on a tile — the main deck is there, the side zones may not be.
     */
    listStatus: metaListStatusSchema,
    name: z.string(),
    format: deckFormatSchema,
    legendCardId: z.string().nullable(),
    legendName: z.string().nullable(),
    legendSlug: z.string().nullable(),
    legendImageId: z.string().nullable(),
    championCardId: z.string().nullable(),
    championName: z.string().nullable(),
    championImageId: z.string().nullable(),
    playerName: z.string(),
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

/** The event and its whole standings table, best finish first. */
export const metaEventDetailResponseSchema = z
  .object({
    event: metaEventDetailSchema,
    players: z.array(metaEventPlayerSchema),
    /** Round-by-round results, empty for events whose source published none. */
    matches: z.array(metaEventMatchSchema),
    /** The stages those rounds belong to, empty when the source named none. */
    phases: z.array(metaEventPhaseSchema),
  })
  .openapi("MetaEventDetailResponse");

export const metaDeckListResponseSchema = z
  .object({ decks: z.array(metaDeckSummarySchema) })
  .openapi("MetaDeckListResponse");

/**
 * The public share-deck payload plus the archive's own panel. Structurally the
 * same shape `/decks/share/{token}` returns, so the share page's renderer is
 * reused verbatim and only the `meta` block is new.
 */
export const metaDeckDetailResponseSchema = publicDeckDetailResponseSchema
  .extend({
    meta: z.object({
      event: metaDeckEventSchema,
      /**
       * Only ever `"full"` or `"partial"` here — a standings-only entry has no
       * deck and so no page. `"partial"` is what the page acts on: it tells the
       * reader the source published a complete main deck but may have left the
       * side zones out.
       */
      listStatus: metaListStatusSchema,
      playerName: z.string(),
      rank: z.number().int(),
      rankIsTier: z.boolean(),
      wins: z.number().int().nullable(),
      losses: z.number().int().nullable(),
      draws: z.number().int().nullable(),
      /**
       * Who added this deck to the archive, as the page prints them: display
       * names already resolved and already filtered by
       * `meta_credit_visibility`, never user ids. Empty when nobody is credited
       * or everybody who is has opted out.
       *
       * The deck's own line, not the event's: a contributor's name on the
       * specific list they typed in is the thing they submitted for.
       */
      contributors: z.array(z.string()),
    }),
  })
  .openapi("MetaDeckDetailResponse");

/**
 * How much the archive holds in scope: `totalPlayers` counts every standings
 * row, `decksWithMainDeck` the entries whose main deck is published (`full`
 * and `partial` alike, since a partial list's main deck is complete). Counts
 * about the archive itself, used to caption the page's lists.
 */
export const metaCountsResponseSchema = z
  .object({
    totalPlayers: z.number().int().nonnegative(),
    decksWithMainDeck: z.number().int().nonnegative(),
  })
  .openapi("MetaCountsResponse");

/**
 * The event fields a finish prints without leaving the legend's page: enough for
 * the row's date, tier and venue line, and the link back to the event itself.
 */
const metaLegendEventSchema = z.object({
  slug: z.string(),
  name: z.string(),
  eventDate: isoDate,
  format: deckFormatSchema,
  tier: metaEventTierSchema,
  country: z.string().nullable(),
  playerCount: z.number().int().nullable(),
});

/**
 * One archived result for one legend: a published standings row, seen from the
 * legend's side rather than the event's.
 *
 * `shareToken` is set exactly for the finishes a decklist is known for; the rest
 * carry `listStatus: "none"` and offer the submission form instead.
 */
export const metaLegendFinishSchema = z
  .object({
    /** The `meta_event_players` row, so a list can key on it. */
    playerId: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    playerName: z.string(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
    event: metaLegendEventSchema,
  })
  .openapi("MetaLegendFinish");

/**
 * One legend as the alphabetical index lists it.
 *
 * `deckCount` is a count of archive content — how many lists are on file — and
 * is the only number the index carries. The index is ordered by name and offers
 * no other order: a page that let a reader sort legends by results would be a
 * ranking of legends against each other, which this archive does not publish.
 */
export const metaLegendSummarySchema = z
  .object({
    /** The route key `/meta/legends/{slug}` resolves, e.g. `kennen-heart-of-the-tempest`. */
    slug: z.string(),
    legend: metaCardRefSchema,
    deckCount: z.number().int().nonnegative(),
  })
  .openapi("MetaLegendSummary");

export const metaLegendListResponseSchema = z
  .object({ legends: z.array(metaLegendSummarySchema) })
  .openapi("MetaLegendListResponse");

/**
 * Every archived finish for one legend, best first.
 *
 * Facts only: each entry is a standings row a tournament published. Nothing here
 * is a rate, a share, or a comparison against another legend.
 */
export const metaLegendDetailResponseSchema = z
  .object({
    slug: z.string(),
    legend: metaCardRefSchema,
    finishes: z.array(metaLegendFinishSchema),
  })
  .openapi("MetaLegendDetailResponse");

export const metaCountsQuerySchema = z.object({
  format: z.string().min(1).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/**
 * oRPC contract for the public meta archive (ADR-014), mounted under
 * `/api/v1/meta`. Every route is anonymous (`auth: "public"`) and SSR-facing.
 *
 * `decks` returns the whole archive unfiltered on purpose: filtering is a
 * client concern here (ADR-009), and the curated corpus is small enough that
 * one cacheable payload beats a filter matrix of uncacheable ones.
 *
 * Domain codes: `event`, `deck`, `legend` → NOT_FOUND. `deck` also 404s for a
 * share token that resolves to a deck outside the archive, so a regular user's
 * shared deck can never be rendered as an archive entry.
 */
export const metaContract = {
  events: oc
    .route({ method: "GET", path: `${BASE}/events`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .output(metaEventListResponseSchema),

  event: oc
    .route({ method: "GET", path: `${BASE}/events/{slug}`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(z.object({ slug: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(metaEventDetailResponseSchema),

  decks: oc
    .route({ method: "GET", path: `${BASE}/decks`, tags: [TAG] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .output(metaDeckListResponseSchema),

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
    .input(z.object({ slug: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Legend not found" } })
    .output(metaLegendDetailResponseSchema),

  counts: oc
    .route({ method: "GET", path: `${BASE}/counts`, tags: [TAG] })
    .meta({ auth: "public", cache: "short" })
    .input(metaCountsQuerySchema)
    .output(metaCountsResponseSchema),
};

export type MetaContract = typeof metaContract;
