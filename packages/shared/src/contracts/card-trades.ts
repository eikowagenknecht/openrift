import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { contactMethodSchema, copyMetadataResponseShape } from "@openrift/shared/response-schemas";
import { friendGroupSlugSchema, idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

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

/** Receiver-sync target collection; omitted defaults to the receiver's inbox. */
export const cardTradeSyncSchema = z.object({
  targetCollectionId: z.uuid().optional(),
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
    userId: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    gravatarHash: z.string(),
    contactMethods: z.array(contactMethodSchema),
  })
  .openapi("CardTradeCounterparty");

export const cardTradeResponseSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    groupSlug: z.string(),
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
    actionNeeded: z.enum(["accept-or-decline", "cancel", "complete", "apply-sync"]).nullable(),
  })
  .openapi("CardTradeResponse");

export const cardTradeListResponseSchema = z
  .object({ items: z.array(cardTradeResponseSchema) })
  .openapi("CardTradeListResponse");

/**
 * One physical copy the giver could promise to a pending trade. All candidates
 * are the same printing, so finish, art variant and language never differ
 * between them; what can differ is the per-copy metadata below plus which
 * collection the copy sits in.
 */
export const cardTradeCopyOptionSchema = z
  .object({
    id: z.string(),
    collectionId: z.string(),
    /** Display name of the collection holding the copy. */
    collectionName: z.string(),
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
 * The copies a pending trade could draw on, giver-only. `copies` is in the
 * server's default pin order (plainest first), so `copies.slice(0, quantity)`
 * is exactly what an accept without `copyIds` would promise.
 */
export const cardTradeCopyOptionsResponseSchema = z
  .object({
    tradeId: z.string(),
    /** How many copies the accept will pin. */
    quantity: z.number().int().positive(),
    /**
     * True when the giver has a real choice worth surfacing: more candidates
     * than the trade needs, and at least two of them differ in metadata a
     * person would care about. False means the client must not prompt.
     */
    choiceMatters: z.boolean(),
    copies: z.array(cardTradeCopyOptionSchema),
  })
  .openapi("CardTradeCopyOptionsResponse");

/**
 * How far along a live trade is, from the viewer's side. `initiator` splits
 * `pending` in two: a request the counterparty made is an `asked` bid, while a
 * request the viewer's own side made is an `offered` commitment (a giver-side
 * offer already consumes supply). `reserved` means accepted with copies pinned,
 * `traded` means physically swapped with the viewer's own sync still to apply.
 *
 * The same four slugs serve both roles. Role plus phase decide the wording,
 * which lives in the client — nothing here is a display string.
 */
export const cardTradeLivePhaseSchema = z
  .enum(["asked", "offered", "reserved", "traded"])
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
 * expired) are absent, and so is a completed trade whose own-side sync the
 * viewer already applied — there is nothing left to surface for either.
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
        count: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("CardTradeActionCountsResponse");

const TAG = "CardTrades";

/**
 * oRPC contract for the authenticated card-trades endpoints (mounted at
 * `/api/v1/trades`). All require a session, so they share the `authedRoute`
 * base (UNAUTHORIZED + FORBIDDEN). Domain codes per route: `create` →
 * NOT_FOUND (group or counterparty) + BAD_REQUEST (self-trade or over-demand)
 * + CONFLICT (no match, insufficient supply, or duplicate live trade);
 * `accept`, `decline`, `cancel`, `complete`, `sync`, `skipSync` → NOT_FOUND
 * (trade) + CONFLICT (wrong state or already resolved); `setQuantity` → also
 * adds BAD_REQUEST (quantity below minimum); `copyOptions` → NOT_FOUND (trade)
 * + CONFLICT (not pending) + FORBIDDEN (viewer is not the giver). `accept` also
 * uses CONFLICT for a rejected `copyIds` choice, and FORBIDDEN when a
 * non-giver sends one. The lifecycle mutations take the trade id as a path
 * param.
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
  copyOptions: authedRoute
    .route({ method: "GET", path: "/api/v1/trades/{id}/copy-options", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade is not pending" },
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
  complete: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/complete", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Trade is not reserved" },
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
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Trade not found" },
      CONFLICT: { message: "Sync not available" },
    })
    .output(cardTradeResponseSchema),
};

export type CardTradesContract = typeof cardTradesContract;
