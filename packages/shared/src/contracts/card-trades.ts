import { oc } from "@orpc/contract";

import {
  cardTradeActionCountsResponseSchema,
  cardTradeListResponseSchema,
  cardTradeResponseSchema,
} from "../response-schemas.js";
import {
  cardTradeSyncSchema,
  cardTradesQuerySchema,
  createCardTradeSchema,
  idParamSchema,
  setCardTradeQuantitySchema,
  withParams,
} from "../schemas.js";

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
