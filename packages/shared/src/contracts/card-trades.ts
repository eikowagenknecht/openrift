import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { contactMethodSchema } from "@openrift/shared/response-schemas";
import { friendGroupSlugSchema, idParamSchema, withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

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

/**
 * Create a trade from a match row. `role` is the *caller's* side: `receiver`
 * is the "I want this card" request (giver = counterparty), `giver` is the
 * "I have this, want it?" offer (receiver = counterparty).
 */
export const createCardTradeSchema = z.object({
  groupSlug: friendGroupSlugSchema,
  counterpartyUserId: z.string().min(1),
  role: z.enum(["giver", "receiver"]),
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

const cardTradeCounterpartySchema = z
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
    role: z.enum(["giver", "receiver"]),
    initiator: z.enum(["giver", "receiver"]),
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
 * `/api/v1/trades`). All require a session (the mount applies `requireAuth`).
 * The lifecycle mutations (accept/decline/cancel/complete/quantity/sync) take
 * the trade id as a path param; state errors thrown by the trade services are
 * bridged to ORPCErrors in the implementation.
 */
export const cardTradesContract = {
  create: oc
    .route({ method: "POST", path: "/api/v1/trades", tags: [TAG], successStatus: 201 })
    .input(createCardTradeSchema)
    .output(cardTradeResponseSchema),
  list: oc
    .route({ method: "GET", path: "/api/v1/trades", tags: [TAG] })
    .input(cardTradesQuerySchema)
    .output(cardTradeListResponseSchema),
  actionCounts: oc
    .route({ method: "GET", path: "/api/v1/trades/action-counts", tags: [TAG] })
    .output(cardTradeActionCountsResponseSchema),
  accept: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/accept", tags: [TAG] })
    .input(idParamSchema)
    .output(cardTradeResponseSchema),
  decline: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/decline", tags: [TAG] })
    .input(idParamSchema)
    .output(cardTradeResponseSchema),
  cancel: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/cancel", tags: [TAG] })
    .input(idParamSchema)
    .output(cardTradeResponseSchema),
  complete: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/complete", tags: [TAG] })
    .input(idParamSchema)
    .output(cardTradeResponseSchema),
  setQuantity: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/quantity", tags: [TAG] })
    .input(withParams(idParamSchema, setCardTradeQuantitySchema))
    .output(cardTradeResponseSchema),
  sync: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/sync", tags: [TAG] })
    .input(withParams(idParamSchema, cardTradeSyncSchema))
    .output(cardTradeResponseSchema),
  skipSync: oc
    .route({ method: "POST", path: "/api/v1/trades/{id}/sync/skip", tags: [TAG] })
    .input(idParamSchema)
    .output(cardTradeResponseSchema),
};

export type CardTradesContract = typeof cardTradesContract;
