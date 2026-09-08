import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { META_EVENT_OVERLAY_FIELDS, META_PLAYER_OVERLAY_FIELDS } from "../../types/enums.js";
import { authedRoute } from "../_base.js";
import {
  adminMetaEventListQuerySchema,
  adminMetaEventListResponseSchema,
  adminMetaEventSchema,
  adminMetaEventSourceSchema,
  eventBodySchema,
  eventSlugSchema,
} from "./meta-events.js";
import {
  metaCrossSourceReviewSchema,
  metaEventMatchSuggestionSchema,
  metaPlayerMatchSuggestionSchema,
} from "./meta-matching.js";
import {
  acceptClaimFields,
  metaEventDriftSchema,
  metaOverlayBulkAcceptResultSchema,
  metaOverlayDetailSchema,
  metaOverlayQueueRowSchema,
  metaOverlayReviewResultSchema,
  playerOverlayFieldsSchema,
  playerOverlayListSchema,
} from "./meta-overlays.js";
import { adminMetaPlayerSchema, createMetaPlayerSchema } from "./meta-players.js";
import {
  metaUploadResponseSchema,
  metaUploadRevertResultSchema,
  metaUploadSchema,
  metaUploadSummarySchema,
} from "./meta-uploads.js";

const TAG = "Admin - Meta archive";
const OVERLAY_TAG = "Admin - Meta overlays";
const BASE = "/api/admin/v1/meta";

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
