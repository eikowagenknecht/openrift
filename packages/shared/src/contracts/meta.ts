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
 * One podium finish of an archived event: a rank ≤ 3 standings row, as an event
 * list prints it inline. Published results, not computed standings — an event
 * whose standings the archive does not hold has no finishes rather than guessed
 * ones, and a source that published two of the same place gets both named.
 */
export const metaEventFinishSchema = z
  .object({
    /** 1-based standing. Repeats on a tie, and every tied row stands. */
    rank: z.number().int(),
    /** True when the source published cut buckets ("Top 4") rather than exact standings. */
    rankIsTier: z.boolean(),
    playerName: z.string(),
    /**
     * The key of the player's page at `/meta/players/{key}`, or null for a row
     * the source filed under no identity.
     */
    playerKey: z.string().nullable(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    legend: metaCardRefSchema.nullable(),
  })
  .openapi("MetaEventFinish");

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
    /**
     * The podium the archive holds — every rank ≤ 3 row, best first — empty
     * until standings are archived. Rank-1 rows are the winners; a tie shares
     * a rank and every tied row is listed.
     */
    topFinishes: z.array(metaEventFinishSchema),
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
  tier: metaEventTierSchema,
  /** ISO 3166-1 alpha-2 of the venue, null when no source told us. */
  country: z.string().nullable(),
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
    /**
     * The key of the player's page at `/meta/players/{key}`, or null for a row
     * the source filed under no identity.
     */
    playerKey: z.string().nullable(),
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
    /**
     * The legend's archive page key, composed here rather than at the tile: the
     * key needs the champion tag, and a caller holding only the display name
     * cannot tell a composed legend name from a champion unit's printed one.
     * Null for a deck whose legend zone the archive holds nothing for.
     */
    legendArchiveSlug: z.string().nullable(),
    legendImageId: z.string().nullable(),
    championCardId: z.string().nullable(),
    championName: z.string().nullable(),
    championImageId: z.string().nullable(),
    playerName: z.string(),
    /**
     * The key of the player's page at `/meta/players/{key}`, or null for a row
     * the source filed under no identity.
     */
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

/**
 * What kind of addition an activity row reports: a new event on record, a batch
 * of decklists, or a batch of standings rows landing on an existing event.
 */
export const metaActivityKindSchema = z.enum(["event-added", "decks-added", "results-added"]);

/**
 * One recent addition to the archive. Additions are reported as bursts — all
 * rows of one kind landing on one event within one UTC day are one item — so a
 * bulk import reads as "118 decklists added", not 118 rows.
 */
export const metaActivityItemSchema = z
  .object({
    kind: metaActivityKindSchema,
    /** When the newest row of the burst landed. */
    occurredAt: isoDateTime,
    /** Rows in the burst: decklists or standings rows. Null for `event-added`. */
    count: z.number().int().positive().nullable(),
    event: z.object({ slug: z.string(), name: z.string() }),
  })
  .openapi("MetaActivityItem");

/** Newest first. */
export const metaActivityResponseSchema = z
  .object({ items: z.array(metaActivityItemSchema) })
  .openapi("MetaActivityResponse");

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
  .object({
    decks: z.array(metaDeckSummarySchema),
    /** Rows the query matched before `limit` cut it, which is what a count line prints. */
    total: z.number().int().nonnegative(),
  })
  .openapi("MetaDeckListResponse");

/**
 * What every archived list is made of, as the browser's collection overlay needs
 * it: which cards, and how many of each.
 *
 * Card ids are pooled in `cards` and referenced by position because the archive
 * holds tens of thousands of deck-card rows over a few hundred distinct cards,
 * and repeating a uuid per row multiplies the payload by roughly eight. `entries`
 * is a flat run of `[cardIndex, quantity]` pairs for the same reason.
 * The sideboard is its own run; every other zone is summed into `entries`.
 */
export const metaDeckCardIndexResponseSchema = z
  .object({
    cards: z.array(z.string()),
    decks: z.array(
      z.object({
        deckId: z.string(),
        /** Flat `[cardIndex, quantity]` pairs. */
        entries: z.array(z.number().int().nonnegative()),
        /** Flat `[cardIndex, quantity]` pairs. */
        sideboard: z.array(z.number().int().nonnegative()),
      }),
    ),
  })
  .openapi("MetaDeckCardIndexResponse");

/**
 * The public share-deck payload plus the archive's own panel. Structurally the
 * same shape `/decks/share/{token}` returns, so the share page's renderer is
 * reused verbatim and only the `meta` block is new.
 */
export const metaDeckDetailResponseSchema = publicDeckDetailResponseSchema
  .extend({
    meta: z.object({
      /**
       * The deck's event, plus the field size the source reported. The hero
       * states the finish against it ("1st of 3,283"), which is a claim about
       * the tournament rather than about the rows the archive holds, so it is
       * left unsaid when no source published one.
       */
      event: metaDeckEventSchema.extend({ playerCount: z.number().int().nullable() }),
      /**
       * Only ever `"full"` or `"partial"` here — a standings-only entry has no
       * deck and so no page. `"partial"` is what the page acts on: it tells the
       * reader the source published a complete main deck but may have left the
       * side zones out.
       */
      listStatus: metaListStatusSchema,
      playerName: z.string(),
      /**
       * The key of the player's page at `/meta/players/{key}`, or null for a row
       * the source filed under no identity.
       */
      playerKey: z.string().nullable(),
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
 *
 * `totalEvents` and `eventsByTier` ignore the query's filters: they are the
 * archive's own size, which a page prints beside a scoped number to say how
 * much of the whole the reader is looking at.
 */
export const metaCountsResponseSchema = z
  .object({
    totalPlayers: z.number().int().nonnegative(),
    decksWithMainDeck: z.number().int().nonnegative(),
    totalEvents: z.number().int().nonnegative(),
    eventsByTier: z.object({
      premier: z.number().int().nonnegative(),
      competitive: z.number().int().nonnegative(),
      store: z.number().int().nonnegative(),
      casual: z.number().int().nonnegative(),
    }),
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
    /**
     * The key of the player's page at `/meta/players/{key}`, or null for a row
     * the source filed under no identity.
     */
    playerKey: z.string().nullable(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    shareToken: z.string().nullable(),
    listStatus: metaListStatusSchema,
    event: metaLegendEventSchema,
  })
  .openapi("MetaLegendFinish");

/**
 * One legend's results at one event, folded to what the index needs: its best
 * placing there and how much of the archive's content sits under it. Facts
 * about the standings rows on file, never a rate or a share.
 *
 * Keyed by the event's slug rather than carrying the event: the index page
 * already holds the events payload, and joining client-side is what lets the
 * scope bar narrow this list without a per-filter request (ADR-014).
 */
const metaLegendEventRecordSchema = z.object({
  eventSlug: z.string(),
  /** The legend's best rank at this event, with `rankIsTier` describing that row. */
  bestRank: z.number().int(),
  rankIsTier: z.boolean(),
  /** Standings rows filed under this legend at this event. */
  finishes: z.number().int().nonnegative(),
  /** The subset of those rows with a published list. */
  decklists: z.number().int().nonnegative(),
  /** Whether a rank-1 row is among them. */
  won: z.boolean(),
});

/**
 * One legend as the index lists it: who it is, and its per-event records for
 * the page to fold into scoped counts and a best finish client-side.
 */
export const metaLegendSummarySchema = z
  .object({
    /** The route key `/meta/legends/{slug}` resolves, e.g. `kennen-heart-of-the-tempest`. */
    slug: z.string(),
    legend: metaCardRefSchema,
    /** Newest event first. */
    records: z.array(metaLegendEventRecordSchema),
  })
  .openapi("MetaLegendSummary");

export type MetaLegendEventRecord = z.infer<typeof metaLegendEventRecordSchema>;

export const metaLegendListResponseSchema = z
  .object({ legends: z.array(metaLegendSummarySchema) })
  .openapi("MetaLegendListResponse");

/**
 * One legend's record inside the scope the request asked for: the headline
 * counts, the placings a reader came for, and one page of the record itself.
 *
 * Facts only: each entry is a standings row a tournament published. Nothing here
 * is a rate, a share, or a comparison against another legend.
 */
export const metaLegendDetailResponseSchema = z
  .object({
    slug: z.string(),
    legend: metaCardRefSchema,
    counts: z.object({
      /**
       * Events won, not rank-1 rows: a source that published a shared first
       * place files two rows at one event, and counting rows would report the
       * legend winning it twice.
       */
      wins: z.number().int().nonnegative(),
      finishes: z.number().int().nonnegative(),
      decklists: z.number().int().nonnegative(),
    }),
    /** The five best placings, best first, the newest of an equal placing ahead. */
    best: z.array(metaLegendFinishSchema),
    /** One page of the record, newest first. */
    finishes: z.array(metaLegendFinishSchema),
    /** Finishes in scope, which is what the paging runs over. */
    total: z.number().int().nonnegative(),
    /** The 1-based page `finishes` holds. */
    page: z.number().int().positive(),
  })
  .openapi("MetaLegendDetailResponse");

/**
 * One archived result for one player: a published standings row, seen from the
 * player's side. The legend is the row's own, so the page can group a record by
 * what the player brought.
 */
export const metaPlayerFinishSchema = z
  .object({
    /** The `meta_event_players` row, so a list can key on it. */
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

/**
 * Every archived finish for one player, newest first.
 *
 * Facts only: each entry is a standings row a tournament published. Nothing here
 * is a rate or a comparison against another player.
 */
export const metaPlayerDetailResponseSchema = z
  .object({
    /** The route key `/meta/players/{key}` resolves; see `metaPlayerKey`. */
    key: z.string(),
    /** The name the newest row on record was published under. */
    name: z.string(),
    finishes: z.array(metaPlayerFinishSchema),
  })
  .openapi("MetaPlayerDetailResponse");

export const metaCountsQuerySchema = z.object({
  format: z.string().min(1).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/**
 * Inclusive date-only bounds on the event a deck was played at. Both ends are
 * optional and independent, so a caller can open either side of the window.
 */
export const metaDateRangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/**
 * One facet's include or exclude list. Kept as plain strings rather than the
 * tier or format enums, so a stale bookmark carrying a value the archive
 * retired narrows to nothing instead of failing the whole request.
 */
const scopeFacetList = z.array(z.string().min(1)).max(300).optional();

/**
 * The archive scope bar's selection as a query (ADR-014): a date window plus
 * the three value facets, each an include list or an exclude list.
 *
 * An include list means "one of these", an exclude list "none of these", and a
 * facet never carries both at once. An event no source named a country for is
 * outside every include list and inside every exclude list, since "all but
 * Germany" is a claim about Germany rather than about unplaced events.
 */
export const metaScopeQuerySchema = metaDateRangeQuerySchema.extend({
  formats: scopeFacetList,
  formatsEx: scopeFacetList,
  tiers: scopeFacetList,
  tiersEx: scopeFacetList,
  /** ISO 3166-1 alpha-2. */
  countries: scopeFacetList,
  countriesEx: scopeFacetList,
});

/**
 * Which archived decks a browser is asking for. The order is the endpoint's own
 * and not a parameter: event date descending, then rank, then player.
 *
 * The scope's facets narrow it too, so a capped request returns a full grid of
 * rows that are already in scope rather than a grid the page then thins.
 */
export const metaDeckQuerySchema = metaScopeQuerySchema.extend({
  /** A legend's card id, for the decks filed under one legend. */
  legend: z.string().min(1).optional(),
  /** A player key, as `/meta/players/{key}` spells it. */
  player: z.string().min(1).optional(),
  /** Rows to return. `total` still counts the whole match. */
  limit: z.coerce.number().int().positive().optional(),
});

/** One legend's page: the scope its counts are taken over, plus which page of it. */
export const metaLegendQuerySchema = metaScopeQuerySchema.extend({
  slug: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
});

/**
 * oRPC contract for the public meta archive (ADR-014), mounted under
 * `/api/v1/meta`. Every route is anonymous (`auth: "public"`) and SSR-facing.
 *
 * Every read is scoped server-side to what its page renders: absent bounds
 * still return the whole archive, but no page asks for that. `deckCards` keeps
 * the date window alone, since it is fetched under the same window as the deck
 * list it annotates.
 *
 * Domain codes: `event`, `deck`, `legend` → NOT_FOUND. `deck` also 404s for a
 * share token that resolves to a deck outside the archive, so a regular user's
 * shared deck can never be rendered as an archive entry.
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
