import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { contactMethodSchema } from "@openrift/shared/response-schemas";
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
 * adds BAD_REQUEST (quantity below minimum). The lifecycle mutations take the
 * trade id as a path param.
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
  accept: authedRoute
    .route({ method: "POST", path: "/api/v1/trades/{id}/accept", tags: [TAG] })
    .input(idParamSchema)
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
