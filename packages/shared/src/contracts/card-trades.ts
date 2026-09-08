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

// Also the `card_trades.initiator` vocabulary.
export const cardTradeSideSchema = z.enum(["giver", "receiver"]);

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

export const setCardTradeQuantitySchema = z.object({
  quantity: z.number().int().min(1),
});

export const cardTradeSyncSchema = z.object({
  targetCollectionId: z.uuid().optional(),
  copyIds: z.array(z.uuid()).min(1).max(100).optional(),
  quantity: z.number().int().min(1).optional(),
});

export const cardTradeSkipSyncSchema = z.object({
  quantity: z.number().int().min(1).optional(),
});

export const acceptCardTradeSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(100).optional(),
});

const cardTradeStatusResponseSchema = z
  .enum(["pending", "reserved", "completed", "declined", "cancelled", "expired"])
  .openapi("CardTradeStatus");

export const cardTradeCounterpartySchema = z
  .object({
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
    groupId: z.string().nullable(),
    groupSlug: z.string().nullable(),
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

export const cardTradeCopyOptionSchema = z
  .object({
    id: z.string(),
    collectionId: z.string(),
    collectionName: z.string(),
    pinned: z.boolean(),
    ...copyMetadataResponseShape,
    notesPrivate: z.string().nullable(),
    hasRecordedDetails: z.boolean(),
  })
  .openapi("CardTradeCopyOption");

export const cardTradeCopyOptionsResponseSchema = z
  .object({
    tradeId: z.string(),
    quantity: z.number().int().positive(),
    choiceMatters: z.boolean(),
    copies: z.array(cardTradeCopyOptionSchema),
  })
  .openapi("CardTradeCopyOptionsResponse");

export const cardTradeLivePhaseSchema = z
  .enum(CARD_TRADE_LIVE_PHASES)
  .openapi("CardTradeLivePhase");

// Deliberately identity-free: no counterparty, no group, no user id.
export const cardTradeLiveAnnotationSchema = z
  .object({
    printingId: z.string(),
    role: cardTradeSideSchema,
    phase: cardTradeLivePhaseSchema,
    tradeCount: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })
  .openapi("CardTradeLiveAnnotation");

/** Terminal trades are absent, and so is a `reserved` trade the viewer has already settled. */
export const cardTradeLiveByPrintingResponseSchema = z
  .object({ annotations: z.array(cardTradeLiveAnnotationSchema) })
  .openapi("CardTradeLiveByPrintingResponse");

/** `people` is distinct counterparties waiting on the viewer, pooled across groups. */
export const cardTradeActionCountsResponseSchema = z
  .object({
    total: z.number().int().nonnegative(),
    people: z.number().int().nonnegative(),
    byGroup: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        count: z.number().int().nonnegative(),
        respondCount: z.number().int().nonnegative(),
        settleCount: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("CardTradeActionCountsResponse");

export const cardTradeSheetGroupSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
  })
  .openapi("CardTradeSheetGroup");

export const cardTradeSheetMatchRowSchema = friendGroupMatchRowSchema
  .extend({
    groupId: z.string(),
    groupSlug: z.string(),
  })
  .openapi("CardTradeSheetMatchRow");

/** Rows that show up in several shared groups appear once, attributed to the first group in `groups`. */
export const cardTradeSheetResponseSchema = z
  .object({
    counterparty: cardTradeCounterpartySchema,
    groups: z.array(cardTradeSheetGroupSchema),
    othersHaveYourWants: z.array(cardTradeSheetMatchRowSchema),
    othersWantYourHaves: z.array(cardTradeSheetMatchRowSchema),
  })
  .openapi("CardTradeSheetResponse");

// User ids are text, not uuids.
export const cardTradeSheetParamsSchema = z.object({ userId: z.string().min(1) });

const TAG = "CardTrades";

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
  // NOT_FOUND covers both an unknown user and no shared group; keep them indistinguishable.
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
