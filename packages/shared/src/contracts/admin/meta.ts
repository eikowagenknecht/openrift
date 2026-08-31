import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  deckZoneSchema,
  diffValueSchema,
  metaEntryStatusSchema,
  metaEventTierSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { idParamSchema, isoDate, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { META_EVENT_SORT_DIRECTIONS, META_EVENT_SORTS } from "../../types/enums.js";
import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta archive";
const CANDIDATE_TAG = "Admin - Meta candidates";
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

/** Every field optional — a PATCH touches only what it names. */
const eventPatchSchema = eventBodySchema.partial();

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
    /** The candidates feeding this event, for links back into the review queue. */
    sources: z.array(z.object({ candidateEventId: z.string(), provider: z.string() })),
  })
  .openapi("AdminMetaEvent");

const adminMetaEventListQuerySchema = z.object({
  /** Matched against the event name and the organizer. */
  search: z.string().optional(),
  /** A `deck_formats` slug. */
  format: z.string().optional(),
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
 * A PATCH touches only what it names, with one exception: `list` distinguishes
 * absent (leave the deck alone), an object (create or replace it) and `null`
 * (detach and delete it).
 */
const updateMetaPlayerSchema = z.object({
  eventId: z.uuid().optional(),
  playerName: z.string().min(1).max(80).optional(),
  rank: z.number().int().min(1).optional(),
  rankIsTier: z.boolean().optional(),
  wins: z.number().int().min(0).nullable().optional(),
  losses: z.number().int().min(0).nullable().optional(),
  draws: z.number().int().min(0).nullable().optional(),
  legendCardId: z.uuid().nullable().optional(),
  championCardId: z.uuid().nullable().optional(),
  list: metaPlayerListSchema.nullable().optional(),
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
          code: z.ZodIssueCode.custom,
          message: `player "${player.externalId}" claims listStatus "${player.listStatus}" but carries no cards`,
        });
        return z.NEVER;
      }
      return { ...player, cards, listStatus: "none" as const };
    }
    if (player.listStatus === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
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

const uploadPlayerDetailSchema = z.object({
  eventExternalId: z.string(),
  externalId: z.string(),
  playerName: z.string(),
});

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
    removedPlayers: z.number().int(),
    unchangedPlayers: z.number().int(),
    /** Events and players whose key is on an ignore list. */
    ignoredSkipped: z.number().int(),
    /** One line per dropped duplicate and per item that failed validation. */
    errors: z.array(z.string()),
    newEventDetails: z.array(uploadEventDetailSchema),
    updatedEventDetails: z.array(uploadEventDetailSchema),
    removedPlayerDetails: z.array(uploadPlayerDetailSchema),
    unresolvedCards: z.array(uploadUnresolvedSchema),
  })
  .openapi("MetaUploadResponse");

/**
 * `new` has no live row yet, `changed` is linked and disagrees with it,
 * `inSync` is linked and identical. Derived from the link plus the diff, never
 * stored.
 */
const metaCandidateStateSchema = z.enum(["new", "changed", "inSync"]);

export const metaCandidateQueueRowSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    externalId: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    /** Standings rows staged under this candidate, ignored ones excluded. */
    playerRowCount: z.number().int().nonnegative(),
    /** Those that are not in the archive yet. */
    unacceptedPlayerCount: z.number().int().nonnegative(),
    state: metaCandidateStateSchema,
    /** Card names across this event's lists that matched no live card. */
    unresolvedCardCount: z.number().int().nonnegative(),
    /** Candidates (this one included) linked to the same live event; 0 while unlinked. */
    linkedSourceCount: z.number().int().nonnegative(),
    checkedAt: isoDateTime.nullable(),
    metaEventId: z.string().nullable(),
    /** The linked live event's slug, for a direct link out of the queue. */
    metaEventSlug: z.string().nullable(),
  })
  .openapi("MetaCandidateQueueRow");

const metaFieldDiffSchema = z.object({
  field: z.string(),
  from: diffValueSchema,
  to: diffValueSchema,
});

const metaCardDeltaSchema = z.object({
  cardId: z.string(),
  zone: z.string(),
  quantity: z.number().int(),
  /** Resolved for display; null only if the card row vanished under us. */
  name: z.string().nullable(),
});

const metaCardQuantityChangeSchema = z.object({
  cardId: z.string(),
  zone: z.string(),
  from: z.number().int(),
  to: z.number().int(),
  name: z.string().nullable(),
});

const metaPlayerDiffSchema = z.object({
  fields: z.array(metaFieldDiffSchema),
  cards: z.object({
    added: z.array(metaCardDeltaSchema),
    removed: z.array(metaCardDeltaSchema),
    changed: z.array(metaCardQuantityChangeSchema),
  }),
});

const metaCandidateCardSchema = z.object({
  name: z.string(),
  zone: z.string(),
  quantity: z.number().int(),
  /** Null when the name matched no live card — which blocks accepting the list. */
  cardId: z.string().nullable(),
});

export const metaCandidatePlayerSchema = z
  .object({
    id: z.string(),
    externalId: z.string(),
    playerName: z.string(),
    rank: z.number().int(),
    rankIsTier: z.boolean(),
    wins: z.number().int().nullable(),
    losses: z.number().int().nullable(),
    draws: z.number().int().nullable(),
    /**
     * The standings columns behind the rank, as the source published them. Null
     * for the producers that publish a placement and nothing else, which is
     * most of them.
     */
    matchPoints: z.number().int().nullable(),
    opponentMatchWinPct: z.number().nullable(),
    gameWinPct: z.number().nullable(),
    opponentGameWinPct: z.number().nullable(),
    entryStatus: metaEntryStatusSchema.nullable(),
    /** The legend name exactly as the source wrote it, kept even when it resolves. */
    legendName: z.string().nullable(),
    /** Null when `legendName` matched no live card, and when the source named none. */
    legendCardId: z.string().nullable(),
    championName: z.string().nullable(),
    championCardId: z.string().nullable(),
    /** Null for a standings-only entry — not the same statement as an empty list. */
    cards: z.array(metaCandidateCardSchema).nullable(),
    /** How complete the source says its list is. */
    listStatus: metaListStatusSchema,
    /** The distinct card names that matched nothing. Empty means the list can be taken. */
    unresolvedNames: z.array(z.string()),
    /** The live standings row this candidate is linked to. */
    metaEventPlayerId: z.string().nullable(),
    /** That row's deck, when it has one. */
    deckId: z.string().nullable(),
    /** That deck's permalink token. */
    shareToken: z.string().nullable(),
    /**
     * Set only for the `usersubmission` provider (ADR-036) — who contributed
     * this list. Admin-facing: nothing public reads it, and the public credit
     * is the event page's contributor line.
     */
    submittedByUserId: z.string().nullable(),
    /** The submitter's display name, resolved from the id. Null when unset or deleted. */
    submittedByName: z.string().nullable(),
    /** Free-text note the contributor attached to their submission. */
    submissionNote: z.string().nullable(),
    state: metaCandidateStateSchema,
    /** Null while unlinked — there is nothing to diff against yet. */
    diff: metaPlayerDiffSchema.nullable(),
    checkedAt: isoDateTime.nullable(),
  })
  .openapi("MetaCandidatePlayer");

/**
 * One source's version of an event, for the review screen's compare grid: its
 * key, the field values it proposes, and the standings it holds. The live values
 * it is compared against are the event's own row, which the caller already has.
 */
export const metaCandidateSourceSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    externalId: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    /** This provider's page for the event; becomes its citation when linked. */
    sourceUrl: z.string().nullable(),
    notes: z.string().nullable(),
    tier: z.string().nullable(),
    country: z.string().nullable(),
    location: z.string().nullable(),
    checkedAt: isoDateTime.nullable(),
    players: z.array(metaCandidatePlayerSchema),
  })
  .openapi("MetaCandidateSource");

export const metaCandidateDetailSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    externalId: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    /** Whether `format` is in `deck_formats`; accepting an unknown one is refused. */
    formatKnown: z.boolean(),
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    notes: z.string().nullable(),
    tier: z.string().nullable(),
    country: z.string().nullable(),
    location: z.string().nullable(),
    extraData: z.unknown().nullable(),
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    state: metaCandidateStateSchema,
    /** Null while unlinked. */
    diff: z.array(metaFieldDiffSchema).nullable(),
    checkedAt: isoDateTime.nullable(),
    players: z.array(metaCandidatePlayerSchema),
    /**
     * Every candidate linked to the same live event, this one included, so the
     * review screen renders one column per source without a second request
     * (the card pipeline's `sources` array, applied to events). Ordered by
     * provider, so the columns keep their places between visits.
     *
     * A candidate that is not linked yet has no siblings by definition, and the
     * array then holds only itself.
     */
    sources: z.array(metaCandidateSourceSchema),
    /**
     * Candidate players hanging off the *live* event directly rather than off
     * any candidate event — user submissions against an event the archive
     * already has (ADR-014). They belong to the roster like any source's rows,
     * but to no source column. Empty while this candidate is unlinked.
     */
    submittedPlayers: z.array(metaCandidatePlayerSchema),
  })
  .openapi("MetaCandidateDetail");

/**
 * The live event columns one source's value can be taken into (ADR-014's
 * per-field review). `slug` is absent because it is minted once at accept and
 * renaming it breaks every published link; attribution is absent because it is
 * no longer a column.
 */
export const META_EVENT_ACCEPT_FIELDS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
  "tier",
  "country",
  "location",
] as const;

/**
 * The standings columns one source's value can be taken into. `legend` and
 * `champion` write the resolved card ids, so a source whose name matched
 * nothing has nothing to take.
 *
 * Two things are deliberately absent. The card list moves whole, through
 * `acceptMetaDeckList`. And `listStatus` is not a field of its own: the live row
 * CHECKs that a deck and its status agree, so taking a status without the list
 * it describes could only ever write an illegal row.
 * @see META_EVENT_ACCEPT_FIELDS
 */
export const META_PLAYER_ACCEPT_FIELDS = [
  "playerName",
  "rank",
  "rankIsTier",
  "wins",
  "losses",
  "draws",
  "legend",
  "champion",
] as const;

/** One live-event column the per-field accept will write. */
export type MetaEventAcceptField = (typeof META_EVENT_ACCEPT_FIELDS)[number];

/** One live standings column the per-field accept will write. */
export type MetaPlayerAcceptField = (typeof META_PLAYER_ACCEPT_FIELDS)[number];

const acceptMetaEventFieldSchema = z.object({ field: z.enum(META_EVENT_ACCEPT_FIELDS) });
const acceptMetaPlayerFieldSchema = z.object({ field: z.enum(META_PLAYER_ACCEPT_FIELDS) });

/** The live event a link, relink or unlink left the candidate pointing at. */
export const metaEventLinkResultSchema = z
  .object({
    /** Null after an unlink. */
    metaEventId: z.string().nullable(),
    slug: z.string().nullable(),
  })
  .openapi("MetaEventLinkResult");

/** The live standings row a link, relink or unlink left the candidate pointing at. */
export const metaPlayerLinkResultSchema = z
  .object({
    metaEventPlayerId: z.string().nullable(),
    /** That row's deck, when it has one. */
    deckId: z.string().nullable(),
  })
  .openapi("MetaPlayerLinkResult");

const linkMetaEventSchema = z.object({ metaEventId: z.uuid() });
const linkMetaPlayerSchema = z.object({ metaEventPlayerId: z.uuid() });

/**
 * One proposed live event for an unlinked candidate, with the signals behind
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

/** One proposed standings row for an unlinked candidate player, inside its own event. */
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
 * The whole-entity event accept's refusal when another source also feeds the
 * live event and the caller did not confirm the overwrite.
 *
 * A code of its own rather than a second `CONFLICT`, because the two 409s want
 * opposite responses from the UI: a slug collision is a dead end, while this
 * one is a question — "also fed by uvsgames, overwrite?" — that the client
 * answers by retrying with `overwriteAll`. `status` is pinned because the code
 * is not one of oRPC's standard ones, and without it the defined-error upgrade
 * is silently skipped and the client sees a generic failure.
 */
const OVERWRITE_NOT_CONFIRMED_ERROR = {
  status: 409,
  message: "This event also carries values from another source",
} as const;

/**
 * Confirms taking every field of one source over an event a second source also
 * feeds. Required only in that case: a single-source event has no other
 * source's values to clobber, so the one-click accept stays one click.
 */
const acceptMetaEventSchema = z.object({
  overwriteAll: z.boolean().optional().default(false),
});

/**
 * A standings-only entry whose legend name matched nothing can still be filed —
 * the archive knows who played and how they finished — but only when the admin
 * says so, because the alternative is dropping the row from the standings.
 * An entry with a *list* is never covered by this: an unresolved card name is a
 * missing alias, and the fix is `resolveName`.
 */
const acceptMetaPlayerSchema = z.object({
  allowUnresolvedLegend: z.boolean().optional().default(false),
});

export const acceptedMetaEventSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    /** False when the candidate was already linked and the accept applied a diff. */
    created: z.boolean(),
  })
  .openapi("AcceptedMetaEvent");

export const acceptedMetaPlayerSchema = z
  .object({
    metaEventPlayerId: z.string(),
    /** Null when the candidate carried no list, which is most entries. */
    deckId: z.string().nullable(),
    created: z.boolean(),
  })
  .openapi("AcceptedMetaPlayer");

export const acceptedMetaEventWithPlayersSchema = acceptedMetaEventSchema
  .extend({
    acceptedPlayers: z.array(acceptedMetaPlayerSchema),
    skippedPlayers: z.array(
      z.object({
        candidatePlayerId: z.string(),
        externalId: z.string(),
        playerName: z.string(),
        reason: z.string(),
      }),
    ),
  })
  .openapi("AcceptedMetaEventWithPlayers");

const ignoredMetaCandidateSchema = z.object({
  provider: z.string(),
  externalId: z.string(),
  createdAt: isoDateTime,
});

/** Player ids repeat across events, so an ignored entry names its event too. */
const ignoredMetaCandidatePlayerSchema = ignoredMetaCandidateSchema.extend({
  eventExternalId: z.string(),
});

const sourceKeyInput = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

const playerSourceKeyInput = sourceKeyInput.extend({
  eventExternalId: z.string().min(1),
});

/** `false` un-reviews a row, putting it back in the queue. */
const checkedInput = z.object({ checked: z.boolean() });

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
 * `deleteEvent`, `eventPlayers`, `createPlayer`, `updatePlayer`, `deletePlayer`,
 * `eventSources`, `createEventSource`, `deleteEventSource` → NOT_FOUND;
 * `updateEvent` also CONFLICT when a rename collides; `deleteEventSource` also
 * CONFLICT for a provider citation, which is owned by its candidate's link.
 *
 * Citations replaced the single `source_url` column (migration 255). Only
 * hand-entered ones are created here; a provider's row is written when its
 * candidate is linked and removed when it is unlinked.
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
   * scanning it: the standings page and the candidate review screen each read
   * the single row they are about through here.
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

  updateEvent: authedRoute
    .route({ method: "PATCH", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, eventPatchSchema))
    .errors({
      NOT_FOUND: { message: "Event not found" },
      CONFLICT: { message: "An event with that slug already exists" },
      BAD_REQUEST: { message: "Unknown deck format" },
    }),

  deleteEvent: authedRoute
    .route({ method: "DELETE", path: `${BASE}/events/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } }),

  /**
   * Re-runs the tier and country rules over every uvsgames candidate and
   * pushes the results onto the live events they feed — except live values a
   * human changed, which are recognized by disagreeing with what the pipeline
   * last claimed and left alone. This is how a rule change in code reaches
   * rows classified under the old rules.
   */
  reclassifyEvents: authedRoute
    .route({ method: "POST", path: `${BASE}/events/reclassify`, tags: [TAG] })
    .output(
      z
        .object({
          /** Candidates whose stored classification changed. */
          candidates: z.number().int().nonnegative(),
          /** Live events that took at least one recomputed value. */
          liveEvents: z.number().int().nonnegative(),
          /** Live field values kept because a human had changed them. */
          keptManual: z.number().int().nonnegative(),
        })
        .openapi("MetaReclassifyResult"),
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

  updatePlayer: authedRoute
    .route({ method: "PATCH", path: `${BASE}/players/{id}`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, updateMetaPlayerSchema))
    .errors({
      NOT_FOUND: { message: "Standings row not found" },
      BAD_REQUEST: { message: "Unknown deck format" },
    }),

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
 * oRPC contract for the meta archive's candidate ingest (ADR-014), on the same
 * admin-gated `/api/admin/v1/meta` prefix. `upload` is the machine-facing half —
 * external tooling authenticates with an `x-api-key` that better-auth resolves
 * to an admin session, so it needs no separate auth tier — and everything else
 * is the admin review queue.
 *
 * Candidate players live under `${BASE}/candidate-players/{id}` rather than
 * nested beneath their event, so no player path can be mistaken for an event's
 * `{id}`.
 *
 * Domain codes: every `{id}` route → NOT_FOUND; the accepts additionally →
 * BAD_REQUEST carrying the reason an accept is blocked (unknown format, parent
 * event not accepted yet, unmatched card names), and `acceptEvent` → CONFLICT
 * when no free slug could be minted for the event's name. `linkCandidateEvent`
 * and `linkCandidatePlayer` → CONFLICT when the candidate is already linked
 * (relink is the verb that moves one), and the player links → BAD_REQUEST when
 * the target sits under a different event.
 *
 * Ignoring keeps the candidate row and its live link, and only takes it out of
 * the queue reads. That is what makes ignore, un-ignore, re-upload resolve back
 * to the same live rows instead of staging a duplicate.
 *
 * Three tiers of write, and the tier is the point (ADR-014, amended
 * 2026-08-18): link/relink/unlink move the FK and the citation and write no
 * field values; `acceptEvent` still takes a whole unlinked candidate in one
 * click, which is what a single-source event uses and what must not get slower;
 * `acceptMetaEventField` / `acceptMetaPlayerField` / `acceptMetaDeckList` take
 * exactly one source's version of one thing, which is what the compare grid
 * needs once a second source is linked.
 *
 * `acceptEvent` and `acceptEventWithPlayers` refuse with
 * `OVERWRITE_NOT_CONFIRMED` when a second source is linked and `overwriteAll`
 * is not set — the one case where taking everything from one source silently
 * reverts what the maintainer curated from the other.
 */
export const adminMetaCandidatesContract = {
  upload: authedRoute
    .route({ method: "POST", path: `${BASE}/upload`, tags: [CANDIDATE_TAG] })
    .input(metaUploadSchema)
    .output(metaUploadResponseSchema),

  list: authedRoute
    .route({ method: "GET", path: `${BASE}/candidates`, tags: [CANDIDATE_TAG] })
    .output(z.object({ candidates: z.array(metaCandidateQueueRowSchema) })),

  detail: authedRoute
    .route({ method: "GET", path: `${BASE}/candidates/{id}`, tags: [CANDIDATE_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate event not found" } })
    .output(metaCandidateDetailSchema),

  rematch: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/rematch`, tags: [CANDIDATE_TAG] })
    .output(
      z.object({
        examined: z.number().int(),
        updated: z.number().int(),
        resolved: z.number().int(),
      }),
    ),

  resolveName: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/resolve-name`, tags: [CANDIDATE_TAG] })
    .input(
      z.object({
        // The unresolved name exactly as the candidate carries it.
        name: z.string().min(1).max(200),
        cardId: z.uuid(),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Card not found" },
      BAD_REQUEST: { message: "That name normalizes to nothing matchable" },
    })
    .output(
      z.object({
        examined: z.number().int(),
        updated: z.number().int(),
        resolved: z.number().int(),
      }),
    ),

  acceptEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/{id}/accept`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, acceptMetaEventSchema))
    .errors({
      NOT_FOUND: { message: "Candidate event not found" },
      BAD_REQUEST: { message: "Candidate cannot be accepted" },
      CONFLICT: { message: "No free slug available for this event name" },
      OVERWRITE_NOT_CONFIRMED: OVERWRITE_NOT_CONFIRMED_ERROR,
    })
    .output(acceptedMetaEventSchema),

  acceptEventWithPlayers: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidates/{id}/accept-with-players`,
      tags: [CANDIDATE_TAG],
    })
    .input(withParams(idParamSchema, acceptMetaEventSchema.extend(acceptMetaPlayerSchema.shape)))
    .errors({
      NOT_FOUND: { message: "Candidate event not found" },
      BAD_REQUEST: { message: "Candidate cannot be accepted" },
      CONFLICT: { message: "No free slug available for this event name" },
      OVERWRITE_NOT_CONFIRMED: OVERWRITE_NOT_CONFIRMED_ERROR,
    })
    .output(acceptedMetaEventWithPlayersSchema),

  checkEvent: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidates/{id}/check`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, checkedInput))
    .errors({ NOT_FOUND: { message: "Candidate event not found" } }),

  ignoreEvent: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidates/{id}/ignore`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate event not found" } }),

  acceptPlayer: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-players/{id}/accept`,
      tags: [CANDIDATE_TAG],
    })
    .input(withParams(idParamSchema, acceptMetaPlayerSchema))
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      BAD_REQUEST: { message: "Candidate player cannot be accepted" },
    })
    .output(acceptedMetaPlayerSchema),

  checkPlayer: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-players/{id}/check`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, checkedInput))
    .errors({ NOT_FOUND: { message: "Candidate player not found" } }),

  ignorePlayer: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-players/{id}/ignore`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      // A user submission has no source-event key to ignore on; it is turned
      // down through its ledger instead.
      BAD_REQUEST: { message: "A user submission cannot be ignored" },
    }),

  listIgnored: authedRoute
    .route({ method: "GET", path: `${BASE}/ignored-candidates`, tags: [CANDIDATE_TAG] })
    .output(
      z.object({
        events: z.array(ignoredMetaCandidateSchema),
        players: z.array(ignoredMetaCandidatePlayerSchema),
      }),
    ),

  unignoreEvent: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/ignored-candidates/events`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(sourceKeyInput)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  unignorePlayer: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/ignored-candidates/players`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(playerSourceKeyInput)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  // ── Linking (ADR-014, multi-source) ──────────────────────────────────────
  // Separate from accepting on purpose: a source whose field values you
  // rejected still contributed, usually its standings, so the link and the
  // citation it writes must not depend on taking any of them.

  linkCandidateEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/{id}/link`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaEventSchema))
    .errors({
      NOT_FOUND: { message: "Candidate event not found" },
      CONFLICT: { message: "This candidate is already linked" },
    })
    .output(metaEventLinkResultSchema),

  relinkCandidateEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/{id}/relink`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaEventSchema))
    .errors({ NOT_FOUND: { message: "Candidate event not found" } })
    .output(metaEventLinkResultSchema),

  unlinkCandidateEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/{id}/unlink`, tags: [CANDIDATE_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate event not found" } })
    .output(metaEventLinkResultSchema),

  linkCandidatePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-players/{id}/link`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaPlayerSchema))
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      CONFLICT: { message: "This candidate is already linked" },
      BAD_REQUEST: { message: "That standings row belongs to a different event" },
    })
    .output(metaPlayerLinkResultSchema),

  relinkCandidatePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-players/{id}/relink`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaPlayerSchema))
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      BAD_REQUEST: { message: "That standings row belongs to a different event" },
    })
    .output(metaPlayerLinkResultSchema),

  unlinkCandidatePlayer: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-players/{id}/unlink`, tags: [CANDIDATE_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate player not found" } })
    .output(metaPlayerLinkResultSchema),

  // ── Per-field accept (the compare grid's arrow) ──────────────────────────
  // With two sources on one event, "accept" cannot mean "take all of it": one
  // provider would silently revert the other's name on every re-publish.

  acceptMetaEventField: authedRoute
    .route({ method: "POST", path: `${BASE}/candidates/{id}/accept-field`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, acceptMetaEventFieldSchema))
    .errors({
      NOT_FOUND: { message: "Candidate event not found" },
      BAD_REQUEST: { message: "Link this candidate to a live event first" },
    })
    .output(z.object({ metaEventId: z.string() })),

  acceptMetaPlayerField: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-players/{id}/accept-field`,
      tags: [CANDIDATE_TAG],
    })
    .input(withParams(idParamSchema, acceptMetaPlayerFieldSchema))
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      BAD_REQUEST: { message: "Link this candidate to a standings row first" },
    })
    .output(z.object({ metaEventPlayerId: z.string() })),

  acceptMetaDeckList: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-players/{id}/accept-list`,
      tags: [CANDIDATE_TAG],
    })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Candidate player not found" },
      BAD_REQUEST: { message: "Candidate player's list cannot be taken" },
    })
    .output(z.object({ metaEventPlayerId: z.string(), deckId: z.string() })),

  // ── Match suggestions ────────────────────────────────────────────────────
  // Ranked hints for the link action. Empty for a candidate that is already
  // linked, and for a player whose event has no live event to look inside.

  eventMatchSuggestions: authedRoute
    .route({
      method: "GET",
      path: `${BASE}/candidates/{id}/match-suggestions`,
      tags: [CANDIDATE_TAG],
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
      path: `${BASE}/candidate-players/{id}/match-suggestions`,
      tags: [CANDIDATE_TAG],
    })
    .input(idParamSchema)
    .output(z.object({ suggestions: z.array(metaPlayerMatchSuggestionSchema) })),
};

export type AdminMetaCandidatesContract = typeof adminMetaCandidatesContract;
