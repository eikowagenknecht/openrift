import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  deckFormatSchema,
  deckZoneSchema,
  diffValueSchema,
  metaListStatusSchema,
} from "@openrift/shared/response-schemas";
import { idParamSchema, isoDate, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta archive";
const CANDIDATE_TAG = "Admin - Meta candidates";
const BASE = "/api/admin/v1/meta";

/**
 * Slugs the `/meta` route space already spends on its own pages. An event
 * claiming one would shadow `/meta/decks`, `/meta/stats`, and friends, so they
 * are rejected at the contract boundary rather than left to produce a
 * confusing 404 later.
 */
const RESERVED_EVENT_SLUGS = ["decks", "events", "stats", "new", "admin"];

const eventSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{2,49}$/u, "Slug must be 3-50 lowercase letters, digits, or hyphens")
  .refine((slug) => !RESERVED_EVENT_SLUGS.includes(slug), {
    message: `Reserved slug. Pick another: ${RESERVED_EVENT_SLUGS.join(", ")} are taken`,
  });

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
    deckCount: z.number().int().nonnegative(),
  })
  .openapi("AdminMetaEvent");

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
 * A hand-entered citation: a label and, usually, a link. There is deliberately
 * no way to send `provider` / `externalId` here (the schema is strict, so an
 * attempt is a 400) — a provider citation is written by linking that
 * provider's candidate and removed by unlinking it, and one typed in by hand
 * would collide with that key or outlive the link that owns it.
 */
const createMetaEventSourceFields = {
  label: z.string().trim().min(1).max(60),
  sourceUrl: z.string().trim().min(1).max(2000).nullable().optional().default(null),
};

export const adminMetaDeckSchema = z
  .object({
    deckId: z.string(),
    /** Null while the deck is archetype-only — no main deck, no page, no permalink. */
    shareToken: z.string().nullable(),
    /** How much of the pilot's list the archive holds for this deck. */
    listStatus: metaListStatusSchema,
    name: z.string(),
    format: deckFormatSchema,
    playerName: z.string(),
    finishTier: z.number().int(),
    record: z.string().nullable(),
    cardCount: z.number().int().nonnegative(),
  })
  .openapi("AdminMetaDeck");

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

const createMetaDeckSchema = z.object({
  eventId: z.uuid(),
  name: z.string().min(1).max(200),
  format: z.string().min(1),
  formatConfig: formatConfigSchema.optional(),
  // An archetype sends just the rows its source published, which can be the
  // legend alone — hence min(1) rather than a floor that assumes a whole list.
  // It is still never zero: a deck with no cards says nothing at all.
  cards: z.array(metaDeckCardSchema).min(1).max(500),
  playerName: z.string().min(1).max(80),
  finishTier: z.number().int().min(1),
  record: z.string().min(1).max(20).nullable().optional(),
  /**
   * How much of the list `cards` is. `"archetype"` gets no share token and no
   * public page, and the card-inclusion stats leave it out; `"partial"` is a
   * complete main deck missing some side zones and counts everywhere a full
   * list does.
   */
  listStatus: metaListStatusSchema.optional().default("full"),
});

const updateMetaDeckSchema = z.object({
  eventId: z.uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  playerName: z.string().min(1).max(80).optional(),
  finishTier: z.number().int().min(1).optional(),
  record: z.string().min(1).max(20).nullable().optional(),
  cards: z.array(metaDeckCardSchema).min(1).max(500).optional(),
  /** Promoting out of `"archetype"` alongside the real list is what mints the permalink. */
  listStatus: metaListStatusSchema.optional(),
});

// ── Candidate ingest (ADR-014) ───────────────────────────────────────────────
// Wire validation here is deliberately lenient, exactly as the card pipeline's
// upload is: value constraints are checked per item inside the ingest service so
// one malformed event or deck skips with a reported reason instead of 400-ing
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

/**
 * How much of the pilot's list `cards` holds, as the source itself claims it.
 * Accepting copies this onto `meta_decks.list_status`.
 *
 * - `"full"`: the whole list.
 * - `"partial"`: the main deck is complete, the side zones (battlefields,
 *   runes, sideboard) may be missing. Counts everywhere a full list does, since
 *   card inclusion reads the main zone alone.
 * - `"archetype"`: the main deck is unknown; the cards are the legend and,
 *   where the source named one, the champion. Counts in legend play-rate only,
 *   and gets no public page.
 *
 * Explicit rather than inferred from the card count, and defaulting to `"full"`
 * so existing producers keep uploading whole lists unchanged. A short list, a
 * list missing its battlefields, and a deliberate archetype are three different
 * claims, and only the source can tell them apart.
 */
const listStatus = metaListStatusSchema.optional().default("full");

const uploadDeckCardSchema = z.object({
  /** The card name as the source wrote it; matched through the shared alias index. */
  name: z.string(),
  zone: z.string(),
  quantity: z.number(),
});

const uploadDeckSchema = z.object({
  externalId: z.string(),
  playerName: z.string(),
  finishTier: z.number(),
  record: nullStr,
  /** Sources rarely name lists; accept derives one from the legend when this is null. */
  name: nullStr,
  cards: z.array(uploadDeckCardSchema).optional().default([]),
  listStatus,
});

const uploadEventSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  eventDate: z.string(),
  format: z.string(),
  playerCount: z.number().nullable().optional().default(null),
  organizer: nullStr,
  sourceUrl: nullStr,
  notes: nullStr,
  /** Source fields that map to nothing of ours, kept verbatim. */
  extraData: z.unknown().nullable().optional().default(null),
  decks: z.array(uploadDeckSchema).optional().default([]),
});

export const metaUploadSchema = z.object({
  // Trimmed and bounded here rather than in the service: the provider names the
  // whole batch, so a blank one is a 400 on the request, not a per-item skip.
  provider: z.string().trim().min(1),
  events: z.array(uploadEventSchema).min(1),
});

const uploadEventDetailSchema = z.object({ externalId: z.string(), name: z.string() });

const uploadDeckDetailSchema = z.object({
  eventExternalId: z.string(),
  externalId: z.string(),
  playerName: z.string(),
});

const uploadUnresolvedSchema = z.object({
  eventExternalId: z.string(),
  deckExternalId: z.string(),
  names: z.array(z.string()),
});

export const metaUploadResponseSchema = z
  .object({
    provider: z.string(),
    newEvents: z.number().int(),
    updatedEvents: z.number().int(),
    unchangedEvents: z.number().int(),
    newDecks: z.number().int(),
    updatedDecks: z.number().int(),
    removedDecks: z.number().int(),
    unchangedDecks: z.number().int(),
    /** Events and decks whose key is on an ignore list. */
    ignoredSkipped: z.number().int(),
    /** One line per dropped duplicate and per item that failed validation. */
    errors: z.array(z.string()),
    newEventDetails: z.array(uploadEventDetailSchema),
    updatedEventDetails: z.array(uploadEventDetailSchema),
    removedDeckDetails: z.array(uploadDeckDetailSchema),
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
    deckCount: z.number().int().nonnegative(),
    /** Decks under this candidate that are not in the archive yet. */
    unacceptedDeckCount: z.number().int().nonnegative(),
    state: metaCandidateStateSchema,
    /** Card names across this event's decks that matched no live card. */
    unresolvedCardCount: z.number().int().nonnegative(),
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

const metaDeckDiffSchema = z.object({
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
  /** Null when the name matched no live card — which blocks accepting the deck. */
  cardId: z.string().nullable(),
});

export const metaCandidateDeckSchema = z
  .object({
    id: z.string(),
    externalId: z.string(),
    playerName: z.string(),
    finishTier: z.number().int(),
    record: z.string().nullable(),
    name: z.string().nullable(),
    cards: z.array(metaCandidateCardSchema),
    /** How complete the source says this list is. @see listStatus */
    listStatus: metaListStatusSchema,
    /** The distinct card names that matched nothing. Empty means the deck can be accepted. */
    unresolvedNames: z.array(z.string()),
    deckId: z.string().nullable(),
    /** The linked live deck's permalink token. */
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
    diff: metaDeckDiffSchema.nullable(),
    checkedAt: isoDateTime.nullable(),
  })
  .openapi("MetaCandidateDeck");

/**
 * One source's version of an event, for the review screen's compare grid: its
 * key, the field values it proposes, and the decks it holds. The live values it
 * is compared against are the event's own row, which the caller already has.
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
    checkedAt: isoDateTime.nullable(),
    decks: z.array(metaCandidateDeckSchema),
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
    extraData: z.unknown().nullable(),
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    state: metaCandidateStateSchema,
    /** Null while unlinked. */
    diff: z.array(metaFieldDiffSchema).nullable(),
    checkedAt: isoDateTime.nullable(),
    decks: z.array(metaCandidateDeckSchema),
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
     * Candidate decks hanging off the *live* event directly rather than off any
     * candidate event — user submissions against an event the archive already
     * has (ADR-014). They belong to the deck roster like any source's decks, but
     * to no source column. Empty while this candidate is unlinked.
     */
    submittedDecks: z.array(metaCandidateDeckSchema),
  })
  .openapi("MetaCandidateDetail");

/**
 * The live event columns one source's value can be taken into (ADR-014's
 * per-field review). `slug` is absent because it is minted once at accept and
 * renaming it breaks every published link; attribution is absent because it is
 * no longer a column.
 *
 * The API holds the same list on the write side
 * (`META_EVENT_ACCEPT_FIELDS` in `services/meta-candidate-accept.ts`) and
 * asserts at compile time that the two are identical — `apps/api` cannot export
 * into `packages/shared`, so the wire list lives here and the parity check
 * lives there.
 */
export const META_EVENT_ACCEPT_FIELDS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
] as const;

/**
 * The archived-deck columns one source's value can be taken into. The card list
 * is not among them: it moves whole, through `acceptMetaDeckList`.
 * @see META_EVENT_ACCEPT_FIELDS
 */
export const META_DECK_ACCEPT_FIELDS = [
  "playerName",
  "finishTier",
  "record",
  "listStatus",
] as const;

/** One live-event column the per-field accept will write. */
export type MetaEventAcceptField = (typeof META_EVENT_ACCEPT_FIELDS)[number];

/** One archived-deck column the per-field accept will write. */
export type MetaDeckAcceptField = (typeof META_DECK_ACCEPT_FIELDS)[number];

const acceptMetaEventFieldSchema = z.object({ field: z.enum(META_EVENT_ACCEPT_FIELDS) });
const acceptMetaDeckFieldSchema = z.object({ field: z.enum(META_DECK_ACCEPT_FIELDS) });

/** The live event a link, relink or unlink left the candidate pointing at. */
export const metaEventLinkResultSchema = z
  .object({
    /** Null after an unlink. */
    metaEventId: z.string().nullable(),
    slug: z.string().nullable(),
  })
  .openapi("MetaEventLinkResult");

/** The archived deck a link, relink or unlink left the candidate pointing at. */
export const metaDeckLinkResultSchema = z
  .object({ deckId: z.string().nullable() })
  .openapi("MetaDeckLinkResult");

const linkMetaEventSchema = z.object({ metaEventId: z.uuid() });
const linkMetaDeckSchema = z.object({ deckId: z.uuid() });

/**
 * One proposed live event for an unlinked candidate, with the signals behind
 * its rank. Ranked hints only — nothing is ever linked automatically, because a
 * wrong link fans two unrelated tournaments onto one page.
 */
export const metaEventMatchSuggestionSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: z.string(),
    deckCount: z.number().int().nonnegative(),
    /** Higher is better. Comparable only within one response. */
    score: z.number(),
    /** Why it ranked, in the order the signals were weighed. */
    reasons: z.array(z.string()),
  })
  .openapi("MetaEventMatchSuggestion");

/** One proposed archived deck for an unlinked candidate deck, inside its own event. */
export const metaDeckMatchSuggestionSchema = z
  .object({
    deckId: z.string(),
    name: z.string(),
    playerName: z.string(),
    finishTier: z.number().int(),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi("MetaDeckMatchSuggestion");

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

export const acceptedMetaEventSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    /** False when the candidate was already linked and the accept applied a diff. */
    created: z.boolean(),
  })
  .openapi("AcceptedMetaEvent");

export const acceptedMetaDeckSchema = z
  .object({ deckId: z.string(), created: z.boolean() })
  .openapi("AcceptedMetaDeck");

export const acceptedMetaEventWithDecksSchema = acceptedMetaEventSchema
  .extend({
    acceptedDecks: z.array(acceptedMetaDeckSchema),
    skippedDecks: z.array(
      z.object({
        candidateDeckId: z.string(),
        externalId: z.string(),
        playerName: z.string(),
        reason: z.string(),
      }),
    ),
  })
  .openapi("AcceptedMetaEventWithDecks");

const ignoredMetaCandidateSchema = z.object({
  provider: z.string(),
  externalId: z.string(),
  createdAt: isoDateTime,
});

/** Deck ids repeat across events, so an ignored deck names its event too. */
const ignoredMetaCandidateDeckSchema = ignoredMetaCandidateSchema.extend({
  eventExternalId: z.string(),
});

const sourceKeyInput = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

const deckSourceKeyInput = sourceKeyInput.extend({
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
 * Domain codes: `createEvent` → CONFLICT (slug taken); `updateEvent`,
 * `deleteEvent`, `eventDecks`, `createDeck`, `updateDeck`, `deleteDeck`,
 * `eventSources`, `createEventSource`, `deleteEventSource` → NOT_FOUND;
 * `updateEvent` also CONFLICT when a rename collides; `deleteEventSource` also
 * CONFLICT for a provider citation, which is owned by its candidate's link.
 *
 * Citations replaced the single `source_url` column (migration 255). Only
 * hand-entered ones are created here; a provider's row is written when its
 * candidate is linked and removed when it is unlinked.
 *
 * `deleteEvent` removes the underlying `decks` rows too. The FK cascade only
 * clears the satellite rows, which would otherwise strand the decks under the
 * synthetic owner with no way to reach them.
 */
export const adminMetaContract = {
  listEvents: authedRoute
    .route({ method: "GET", path: `${BASE}/events`, tags: [TAG] })
    .output(z.object({ events: z.array(adminMetaEventSchema) })),

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

  eventDecks: authedRoute
    .route({ method: "GET", path: `${BASE}/events/{id}/decks`, tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Event not found" } })
    .output(z.object({ decks: z.array(adminMetaDeckSchema) })),

  createDeck: authedRoute
    .route({ method: "POST", path: `${BASE}/decks`, tags: [TAG], successStatus: 201 })
    .input(createMetaDeckSchema)
    .errors({
      NOT_FOUND: { message: "Event not found" },
      BAD_REQUEST: { message: "Unknown deck format" },
    })
    // `shareToken` is null for an archetype-only deck: there is no page to link.
    .output(z.object({ deckId: z.string(), shareToken: z.string().nullable() })),

  updateDeck: authedRoute
    .route({ method: "PATCH", path: `${BASE}/decks/{id}`, tags: [TAG], successStatus: 204 })
    .input(withParams(idParamSchema, updateMetaDeckSchema))
    .errors({ NOT_FOUND: { message: "Archived deck not found" } }),

  deleteDeck: authedRoute
    .route({ method: "DELETE", path: `${BASE}/decks/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Archived deck not found" } }),

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
    .input(withParams(idParamSchema, createMetaEventSourceFields).strict())
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
 * Candidate decks live under `${BASE}/candidate-decks/{id}` rather than nested
 * beneath their event, so no deck path can be mistaken for an event's `{id}`.
 *
 * Domain codes: every `{id}` route → NOT_FOUND; the accepts additionally →
 * BAD_REQUEST carrying the reason an accept is blocked (unknown format, parent
 * event not accepted yet, unmatched card names), and `acceptEvent` → CONFLICT
 * when no free slug could be minted for the event's name. `linkCandidateEvent`
 * and `linkCandidateDeck` → CONFLICT when the candidate is already linked
 * (relink is the verb that moves one), and the deck links → BAD_REQUEST when
 * the target sits under a different event.
 *
 * Three tiers of write, and the tier is the point (ADR-014, amended
 * 2026-08-18): link/relink/unlink move the FK and the citation and write no
 * field values; `acceptEvent` still takes a whole unlinked candidate in one
 * click, which is what a single-source event uses and what must not get slower;
 * `acceptMetaEventField` / `acceptMetaDeckField` / `acceptMetaDeckList` take
 * exactly one source's version of one thing, which is what the compare grid
 * needs once a second source is linked.
 *
 * `acceptEvent` and `acceptEventWithDecks` refuse with
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

  acceptEventWithDecks: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidates/{id}/accept-with-decks`,
      tags: [CANDIDATE_TAG],
    })
    .input(withParams(idParamSchema, acceptMetaEventSchema))
    .errors({
      NOT_FOUND: { message: "Candidate event not found" },
      BAD_REQUEST: { message: "Candidate cannot be accepted" },
      CONFLICT: { message: "No free slug available for this event name" },
      OVERWRITE_NOT_CONFIRMED: OVERWRITE_NOT_CONFIRMED_ERROR,
    })
    .output(acceptedMetaEventWithDecksSchema),

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

  acceptDeck: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-decks/{id}/accept`, tags: [CANDIDATE_TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Candidate deck not found" },
      BAD_REQUEST: { message: "Candidate deck cannot be accepted" },
    })
    .output(acceptedMetaDeckSchema),

  checkDeck: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-decks/{id}/check`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, checkedInput))
    .errors({ NOT_FOUND: { message: "Candidate deck not found" } }),

  ignoreDeck: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-decks/{id}/ignore`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate deck not found" } }),

  listIgnored: authedRoute
    .route({ method: "GET", path: `${BASE}/ignored-candidates`, tags: [CANDIDATE_TAG] })
    .output(
      z.object({
        events: z.array(ignoredMetaCandidateSchema),
        decks: z.array(ignoredMetaCandidateDeckSchema),
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

  unignoreDeck: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/ignored-candidates/decks`,
      tags: [CANDIDATE_TAG],
      successStatus: 204,
    })
    .input(deckSourceKeyInput)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  // ── Linking (ADR-014, multi-source) ──────────────────────────────────────
  // Separate from accepting on purpose: a source whose field values you
  // rejected still contributed, usually its decks, so the link and the citation
  // it writes must not depend on taking any of them.

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

  linkCandidateDeck: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-decks/{id}/link`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaDeckSchema))
    .errors({
      NOT_FOUND: { message: "Candidate deck not found" },
      CONFLICT: { message: "This candidate is already linked" },
      BAD_REQUEST: { message: "That deck belongs to a different event" },
    })
    .output(metaDeckLinkResultSchema),

  relinkCandidateDeck: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-decks/{id}/relink`, tags: [CANDIDATE_TAG] })
    .input(withParams(idParamSchema, linkMetaDeckSchema))
    .errors({
      NOT_FOUND: { message: "Candidate deck not found" },
      BAD_REQUEST: { message: "That deck belongs to a different event" },
    })
    .output(metaDeckLinkResultSchema),

  unlinkCandidateDeck: authedRoute
    .route({ method: "POST", path: `${BASE}/candidate-decks/{id}/unlink`, tags: [CANDIDATE_TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Candidate deck not found" } })
    .output(metaDeckLinkResultSchema),

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

  acceptMetaDeckField: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-decks/{id}/accept-field`,
      tags: [CANDIDATE_TAG],
    })
    .input(withParams(idParamSchema, acceptMetaDeckFieldSchema))
    .errors({
      NOT_FOUND: { message: "Candidate deck not found" },
      BAD_REQUEST: { message: "Link this candidate to an archived deck first" },
    })
    .output(z.object({ deckId: z.string() })),

  acceptMetaDeckList: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/candidate-decks/{id}/accept-list`,
      tags: [CANDIDATE_TAG],
    })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Candidate deck not found" },
      BAD_REQUEST: { message: "Candidate deck's list cannot be taken" },
    })
    .output(z.object({ deckId: z.string() })),

  // ── Match suggestions ────────────────────────────────────────────────────
  // Ranked hints for the link action. Empty for a candidate that is already
  // linked, and for a deck whose event has no live event to look inside.

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

  deckMatchSuggestions: authedRoute
    .route({
      method: "GET",
      path: `${BASE}/candidate-decks/{id}/match-suggestions`,
      tags: [CANDIDATE_TAG],
    })
    .input(idParamSchema)
    .output(z.object({ suggestions: z.array(metaDeckMatchSuggestionSchema) })),
};

export type AdminMetaCandidatesContract = typeof adminMetaCandidatesContract;
