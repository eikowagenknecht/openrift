import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { CARD_TRADE_LIVE_PHASES } from "@openrift/shared/card-trade-lifecycle";
import { contactMethodSchema, copyMetadataResponseShape } from "@openrift/shared/response-schemas";
import { friendGroupSlugSchema, idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import { friendGroupMatchRowSchema } from "./friend-groups.js";

extendZodWithOpenApi(z);

export const CARD_TRADE_STATUSES = [
  "pending",
  "reserved",
  "completed",
  "declined",
  "cancelled",
  "expired",
] as const;

const cardTradeStatusSchema = z.enum(CARD_TRADE_STATUSES);

/** Trade sides. Also the `card_trades.initiator` vocabulary. */
export const cardTradeSideSchema = z.enum(["giver", "receiver"]);

/**
 * Create a trade from a match row. `role` is the *caller's* side: `receiver`
 * is the "I want this card" request (giver = counterparty), `giver` is the
 * "I have this, want it?" offer (receiver = counterparty).
 */
export const createCardTradeSchema = z.object({
  groupSlug: friendGroupSlugSchema,
  counterpartyUserId: z.string().min(1),
  role: cardTradeSideSchema,
  printingId: z.uuid(),
  quantity: z.number().int().min(1),
});

export const cardTradesQuerySchema = z.object({
  groupId: z.uuid().optional(),
  status: cardTradeStatusSchema.optional(),
});

/** Resize a pending request to a new total quantity (initiator only). */
export const setCardTradeQuantitySchema = z.object({
  quantity: z.number().int().min(1),
});

/**
 * What the settling party wants done with their own half.
 *
 * `targetCollectionId` is the receiver's target collection; omitted, it
 * defaults to the receiver's inbox.
 *
 * `copyIds` is the giver's choice of which physical copies actually left their
 * hands, which is not necessarily what the accept pinned: a plain copy may have
 * been promised while the one that changed hands came out of another binder.
 * It must list exactly as many distinct ids as this settle covers, from the
 * trade's current candidate set, which is what `copyOptions` returns for a
 * reserved trade. Omitted, the pinned copies are the ones removed. Only the
 * giver may send it.
 *
 * `quantity` settles part of the row: the swap was for three, two changed
 * hands, the third is coming next time. The rest splits off as a trade of its
 * own and stays in flight, so nothing has to claim the remainder happened.
 * Omitted, the whole row settles. It is capped at the row's own quantity, and
 * naming exactly that is the same as omitting it.
 */
export const cardTradeSyncSchema = z.object({
  targetCollectionId: z.uuid().optional(),
  copyIds: z.array(z.uuid()).min(1).max(100).optional(),
  quantity: z.number().int().min(1).optional(),
});

/**
 * Settling a half without the data change. `quantity` splits the row the same
 * way {@link cardTradeSyncSchema} does, which is also how a receiver closes a
 * remainder that never arrived once cancelling is past.
 */
export const cardTradeSkipSyncSchema = z.object({
  quantity: z.number().int().min(1).optional(),
});

/**
 * Accepting party's optional choice of which physical copies to promise. Only
 * the giver may send it, so only on a receiver-initiated request (the giver is
 * the one who accepts there). It must list exactly `quantity` distinct ids from
 * the trade's current candidate set, which is what `copyOptions` returns.
 *
 * Omit the field to let the server pick. It then pins the plainest copies
 * first, so a graded or noted copy stays with its owner while a plain one is
 * still available. An empty array is rejected: send no field instead.
 */
export const acceptCardTradeSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(100).optional(),
});

const cardTradeStatusResponseSchema = z
  .enum(["pending", "reserved", "completed", "declined", "cancelled", "expired"])
  .openapi("CardTradeStatus");

export const cardTradeCounterpartySchema = z
  .object({
    /**
     * NULL once they have deleted their account. `name` then carries the
     * snapshot taken at deletion, and there is no profile left to link to.
     */
    userId: z.string().nullable(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    gravatarHash: z.string(),
    contactMethods: z.array(contactMethodSchema),
  })
  .openapi("CardTradeCounterparty");

export const cardTradeResponseSchema = z
  .object({
    id: z.string(),
    /**
     * NULL once the friend group was deleted. The id and the slug go together —
     * both present for a live group, both absent afterwards — so they stay flat
     * fields rather than a nullable object: `groupName` below is what display
     * code wants, and it never has to reach through a null to get it.
     */
    groupId: z.string().nullable(),
    /** NULL once the group was deleted; there is nothing left to link to. */
    groupSlug: z.string().nullable(),
    /**
     * Always set: the live group's name, or the name it had when it was deleted.
     * A trade always says where it happened.
     */
    groupName: z.string(),
    role: cardTradeSideSchema,
    initiator: cardTradeSideSchema,
    counterparty: cardTradeCounterpartySchema,
    printingId: z.string(),
    cardId: z.string(),
    quantity: z.number().int().positive(),
    status: cardTradeStatusResponseSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    acceptedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    viewerSyncAppliedAt: z.string().nullable(),
    counterpartySyncAppliedAt: z.string().nullable(),
    actionNeeded: z.enum(["accept-or-decline", "cancel", "settle"]).nullable(),
  })
  .openapi("CardTradeResponse");

export const cardTradeListResponseSchema = z
  .object({ items: z.array(cardTradeResponseSchema) })
  .openapi("CardTradeListResponse");

/**
 * One physical copy the giver could put behind a trade. All candidates are the
 * same printing, so finish, art variant and language never differ between them;
 * what can differ is the per-copy metadata below plus which collection the copy
 * sits in.
 */
export const cardTradeCopyOptionSchema = z
  .object({
    id: z.string(),
    collectionId: z.string(),
    /** Display name of the collection holding the copy. */
    collectionName: z.string(),
    /**
     * True when this copy is already pinned to the trade. Always false while
     * the trade is pending (nothing is pinned yet); on a reserved trade the
     * pinned copies are what a settle removes unless the giver picks others.
     */
    pinned: z.boolean(),
    ...copyMetadataResponseShape,
    /** Owner-visible note. The route is giver-only, so this never leaves the owner. */
    notesPrivate: z.string().nullable(),
    /**
     * True when the copy carries anything worth showing: a condition, a grade,
     * an alteration, a note, or a link. Mirrors `copyHasRecordedDetails` in the
     * web app so the two surfaces agree on what "unrecorded" means.
     */
    hasRecordedDetails: z.boolean(),
  })
  .openapi("CardTradeCopyOption");

/**
 * The copies a trade could draw on, giver-only. Serves both ends of the
 * lifecycle, and the candidate set differs between them:
 *
 * - **pending**, for the accept picker: the reservable supply this group can
 *   see. `copies` is in the server's default pin order (plainest first), so
 *   `copies.slice(0, quantity)` is exactly what an accept without `copyIds`
 *   would promise, and nothing is `pinned` yet.
 * - **reserved**, for the settle picker: the copies pinned to this trade plus
 *   every other free copy of the printing in the giver's own collections,
 *   group-shared or not. The card physically changed hands already, so what is
 *   being recorded is which copy left, not what the group could see. Pinned
 *   copies sort first and are what a settle removes by default.
 */
export const cardTradeCopyOptionsResponseSchema = z
  .object({
    tradeId: z.string(),
    /** How many copies the trade takes. */
    quantity: z.number().int().positive(),
    /**
     * True when the giver has a real choice worth surfacing: more candidates
     * than the trade needs, and at least two of them differ in metadata a
     * person would care about. The accept flow must not prompt when it is
     * false. The settle picker ignores it — it is opened deliberately, and
     * showing which copies are about to go is the point.
     */
    choiceMatters: z.boolean(),
    copies: z.array(cardTradeCopyOptionSchema),
  })
  .openapi("CardTradeCopyOptionsResponse");

/**
 * How far along a live trade is, from the viewer's side. `initiator` splits
 * `pending` in two: a request the counterparty made is an `asked` bid, while a
 * request the viewer's own side made is an `offered` commitment (a giver-side
 * offer already consumes supply). `reserved` means accepted with copies pinned
 * and the viewer's own side not yet settled.
 *
 * The ladder stops there. Once the viewer settles, the giver's copies are gone
 * and the receiver's are ordinary owned copies, so there is nothing left to
 * annotate; a marker for the other party's outstanding half would be noise on a
 * card browser. This is why there is no `traded` phase (ADR-019, amendment
 * 2026-08-10).
 *
 * The same three slugs serve both roles. Role plus phase decide the wording,
 * which lives in the client — nothing here is a display string.
 */
export const cardTradeLivePhaseSchema = z
  .enum(CARD_TRADE_LIVE_PHASES)
  .openapi("CardTradeLivePhase");

/**
 * Live trades on one printing, from one side, in one phase. Deliberately
 * identity-free: no counterparty, no group, no user id. The card browser only
 * needs to know that something is in flight, and leaving the parties out keeps
 * an in-progress negotiation off a surface that is easy to shoulder-surf.
 */
export const cardTradeLiveAnnotationSchema = z
  .object({
    printingId: z.string(),
    /** The viewer's side: `giver` is their copy at stake, `receiver` a card coming to them. */
    role: cardTradeSideSchema,
    phase: cardTradeLivePhaseSchema,
    /** Distinct live trades in this bucket. */
    tradeCount: z.number().int().positive(),
    /** Total copies across those trades. */
    quantity: z.number().int().positive(),
  })
  .openapi("CardTradeLiveAnnotation");

/**
 * Every live trade the viewer has, across all their groups, aggregated to one
 * row per (printing, role, phase). Terminal trades (declined, cancelled,
 * expired, completed) are absent, and so is a `reserved` trade the viewer has
 * already settled — there is nothing left to surface for either.
 */
export const cardTradeLiveByPrintingResponseSchema = z
  .object({ annotations: z.array(cardTradeLiveAnnotationSchema) })
  .openapi("CardTradeLiveByPrintingResponse");

export const cardTradeActionCountsResponseSchema = z
  .object({
    total: z.number().int().nonnegative(),
    byGroup: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        /** `respondCount + settleCount`, the group's whole action-needed bucket. */
        count: z.number().int().nonnegative(),
        /** Requests awaiting the viewer's accept or decline (`accept-or-decline`). */
        respondCount: z.number().int().nonnegative(),
        /** Swaps whose own half the viewer hasn't confirmed yet (`settle`). */
        settleCount: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("CardTradeActionCountsResponse");

/**
 * One group the viewer and the counterparty are both in. Enough to label a row
 * and link back to the group's own pages; the rest of the group payload belongs
 * to the friend-groups contract.
 */
export const cardTradeSheetGroupSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
  })
  .openapi("CardTradeSheetGroup");

/**
 * A group match row carrying the group it came from. The trade sheet pools the
 * matches of every shared group into one list, so each row has to say which
 * group's shares produced it — that is the group a trade on this row is created
 * in, and the only thing the person-level view adds to the row.
 */
export const cardTradeSheetMatchRowSchema = friendGroupMatchRowSchema
  .extend({
    groupId: z.string(),
    groupSlug: z.string(),
  })
  .openapi("CardTradeSheetMatchRow");

/**
 * Everything a person-level trade sheet needs about one counterparty, pooled
 * across every group the two share. Rows that show up in several shared groups
 * appear once, attributed to the first group in `groups`.
 */
export const cardTradeSheetResponseSchema = z
  .object({
    counterparty: cardTradeCounterpartySchema,
    /** The shared groups, sorted by name. Never empty — no shared group is a 404. */
    groups: z.array(cardTradeSheetGroupSchema),
    /** Cards the counterparty offers that the viewer wants. */
    othersHaveYourWants: z.array(cardTradeSheetMatchRowSchema),
    /** Cards the viewer offers that the counterparty wants. */
    othersWantYourHaves: z.array(cardTradeSheetMatchRowSchema),
  })
  .openapi("CardTradeSheetResponse");

/** Path input for the person-level trade sheet. User ids are text, not uuids. */
export const cardTradeSheetParamsSchema = z.object({ userId: z.string().min(1) });

const TAG = "CardTrades";

/**
 * oRPC contract for the authenticated card-trades endpoints (mounted at
 * `/api/v1/trades`). All require a session, so they share the `authedRoute`
 * base (UNAUTHORIZED + FORBIDDEN). Domain codes per route: `create` →
 * NOT_FOUND (group or counterparty) + BAD_REQUEST (self-trade or over-demand)
 * + CONFLICT (no match, insufficient supply, or duplicate live trade);
 * `accept`, `decline`, `cancel`, `sync`, `skipSync` → NOT_FOUND
 * (trade) + CONFLICT (wrong state or already resolved); `setQuantity` → also
 * adds BAD_REQUEST (quantity below minimum); `copyOptions` → NOT_FOUND (trade)
 * + CONFLICT (neither pending nor open to settle) + FORBIDDEN (viewer is not
 * the giver). `accept` and `sync` also use CONFLICT for a rejected `copyIds`
 * choice, and FORBIDDEN when a non-giver sends one. `withUser` → NOT_FOUND
 * (unknown user or no shared group, deliberately the same answer so the route
 * cannot be used to probe for accounts) + BAD_REQUEST (the viewer themselves).
 * The lifecycle mutations take the trade id as a path param.
 */
export const cardTradesContract = {
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/trades", tags: [TAG], successStatus: 201 })
    .input(createCardTradeSchema)
    .errors({
      NOT_FOUND: { message: "Group or counterparty not found" },
      BAD_REQUEST: { message: "Invalid trade request" },
      CONFLICT: { message: "Trade cannot be created" },
    })
    .output(cardTradeResponseSchema),
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/trades", tags: [TAG] })
    .input(cardTradesQuerySchema)
    .output(cardTradeListResponseSchema),
  actionCounts: authedRoute
    .route({ method: "GET", path: "/api/v1/trades/action-counts", tags: [TAG] })
    .output(cardTradeActionCountsResponseSchema),
  liveByPrinting: authedRoute
    .route({ method: "GET", path: "/api/v1/trades/live-by-printing", tags: [TAG] })
    .output(cardTradeLiveByPrintingResponseSchema),
  withUser: authedRoute
    .route({ method: "GET", path: "/api/v1/trades/with/{userId}", tags: [TAG] })
    .input(cardTradeSheetParamsSchema)
    .errors({
      NOT_FOUND: { message: "Member not found" },
      BAD_REQUEST: { message: "Cannot open a trade sheet with yourself" },
    })
    .output(cardTradeSheetResponseSchema),
  copyOptions: authedRoute
    .route({ method: "GET", path: "/api/v1/trades/{id}/copy-options", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade has no copies to choose from" },
    })
    .output(cardTradeCopyOptionsResponseSchema),
  accept: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/accept", tags: [TAG] })
    .input(withParams(idParamSchema, acceptCardTradeSchema))
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade state has changed" },
    })
    .output(cardTradeResponseSchema),
  decline: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/decline", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade state has changed" },
    })
    .output(cardTradeResponseSchema),
  cancel: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/cancel", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade cannot be cancelled" },
    })
    .output(cardTradeResponseSchema),
  setQuantity: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/quantity", tags: [TAG] })
    .input(withParams(idParamSchema, setCardTradeQuantitySchema))
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      BAD_REQUEST: { message: "Invalid quantity" },
      CONFLICT: { message: "Trade state has changed" },
    })
    .output(cardTradeResponseSchema),
  sync: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/sync", tags: [TAG] })
    .input(withParams(idParamSchema, cardTradeSyncSchema))
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Sync not available" },
    })
    .output(cardTradeResponseSchema),
  skipSync: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/sync/skip", tags: [TAG] })
    .input(withParams(idParamSchema, cardTradeSkipSyncSchema))
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Sync not available" },
    })
    .output(cardTradeResponseSchema),
};

export type CardTradesContract = typeof cardTradesContract;
