import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { deckFormatSchema, metaListStatusSchema } from "@openrift/shared/response-schemas";
import { isoDate } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicDeckDetailResponseSchema } from "./public-decks.js";

extendZodWithOpenApi(z);

const TAG = "Meta archive";
const BASE = "/api/v1/meta";

/** An event as it appears in a list: enough for a row, without the long-form fields. */
export const metaEventSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: deckFormatSchema,
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    deckCount: z.number().int().nonnegative(),
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
 * One archived deck as a tile or table row. Legend and champion are
 * denormalized (id, name, canonical front image) so the deck browser and the
 * event page SSR without pulling the catalog. Both are nullable: an
 * admin-entered deck is not required to have either zone filled.
 */
export const metaDeckSummarySchema = z
  .object({
    deckId: z.string(),
    /**
     * The public permalink slug — `decks.share_token`, not a second column.
     * Null exactly when `listStatus` is `"archetype"`: such an entry has no
     * page, so its row renders as a plain, non-clickable tile.
     */
    shareToken: z.string().nullable(),
    /**
     * How much of the pilot's list the archive holds. `"partial"` is worth
     * labelling on a tile (the main deck is there, the side zones may not be);
     * `"archetype"` is the state with no page behind it.
     */
    listStatus: metaListStatusSchema,
    name: z.string(),
    format: deckFormatSchema,
    legendCardId: z.string().nullable(),
    legendName: z.string().nullable(),
    legendImageId: z.string().nullable(),
    championCardId: z.string().nullable(),
    championName: z.string().nullable(),
    championImageId: z.string().nullable(),
    playerName: z.string(),
    finishTier: z.number().int(),
    record: z.string().nullable(),
    event: metaDeckEventSchema,
  })
  .openapi("MetaDeckSummary");

export const metaEventListResponseSchema = z
  .object({ events: z.array(metaEventSummarySchema) })
  .openapi("MetaEventListResponse");

export const metaEventDetailResponseSchema = z
  .object({ event: metaEventDetailSchema, decks: z.array(metaDeckSummarySchema) })
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
       * Only ever `"full"` or `"partial"` here — an `"archetype"` has no page,
       * so the route 404s before it can be rendered. `"partial"` is what the
       * page acts on: it tells the reader the source published a complete main
       * deck but may have left the side zones out.
       */
      listStatus: metaListStatusSchema,
      playerName: z.string(),
      finishTier: z.number().int(),
      record: z.string().nullable(),
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

/** One card's presence across the archived decks in scope. */
const metaStatRowSchema = z.object({
  cardId: z.string(),
  name: z.string(),
  slug: z.string(),
  imageId: z.string().nullable(),
  deckCount: z.number().int().nonnegative(),
  /** Battlefield art is stored landscape, so the thumbnail rotates it rather than cropping. */
  landscape: z.boolean(),
});

/**
 * Two denominators, because the two aggregates count over different
 * populations. `totalDecks` is every archived deck in scope and is what
 * `legends` divides by — every deck names its legend whatever its list status,
 * so all three states are legitimate data points there.
 * `decksWithMainDeck` counts the decks whose main deck the archive holds
 * (`full` and `partial` alike, since the card table reads the main zone only)
 * and is what `cards` divides by. The client labels the card panel with the
 * second number so the gap is visible rather than silently deflating every
 * percentage.
 *
 * Uncapped and unpaginated: the archive is curated and small (ADR-014
 * explicitly defers materialized views until pressure shows up).
 */
export const metaStatsResponseSchema = z
  .object({
    totalDecks: z.number().int().nonnegative(),
    decksWithMainDeck: z.number().int().nonnegative(),
    cards: z.array(metaStatRowSchema),
    legends: z.array(metaStatRowSchema),
  })
  .openapi("MetaStatsResponse");

export const metaStatsQuerySchema = z.object({
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
 * Domain codes: `event`, `deck` → NOT_FOUND. `deck` also 404s for a share
 * token that resolves to a deck outside the archive, so a regular user's
 * shared deck can never be rendered as an archive entry, and for one that
 * resolves to a deck whose `listStatus` is `"archetype"`, which has no page.
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

  stats: oc
    .route({ method: "GET", path: `${BASE}/stats`, tags: [TAG] })
    .meta({ auth: "public", cache: "short" })
    .input(metaStatsQuerySchema)
    .output(metaStatsResponseSchema),
};

export type MetaContract = typeof metaContract;
