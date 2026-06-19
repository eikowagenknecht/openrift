import { createRoute } from "@hono/zod-openapi";
import type { CardTradeActionCountsResponse, CardTradeListResponse } from "@openrift/shared";
import {
  cardTradeActionCountsResponseSchema,
  cardTradeListResponseSchema,
  cardTradeResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  cardTradeSyncSchema,
  cardTradesQuerySchema,
  createCardTradeSchema,
  idParamSchema,
  setCardTradeQuantitySchema,
} from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";

const TAG = "CardTrades";

const createTradeRoute = createRoute({
  method: "post",
  path: "/",
  tags: [TAG],
  request: {
    body: { content: { "application/json": { schema: createCardTradeSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Created",
    },
  },
});

const listTradesRoute = createRoute({
  method: "get",
  path: "/",
  tags: [TAG],
  request: { query: cardTradesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeListResponseSchema } },
      description: "Success",
    },
  },
});

const actionCountsRoute = createRoute({
  method: "get",
  path: "/action-counts",
  tags: [TAG],
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeActionCountsResponseSchema } },
      description: "Success",
    },
  },
});

const acceptTradeRoute = createRoute({
  method: "post",
  path: "/{id}/accept",
  tags: [TAG],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Reserved",
    },
  },
});

const declineTradeRoute = createRoute({
  method: "post",
  path: "/{id}/decline",
  tags: [TAG],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Declined",
    },
  },
});

const cancelTradeRoute = createRoute({
  method: "post",
  path: "/{id}/cancel",
  tags: [TAG],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Cancelled",
    },
  },
});

const completeTradeRoute = createRoute({
  method: "post",
  path: "/{id}/complete",
  tags: [TAG],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Completed",
    },
  },
});

const setQuantityTradeRoute = createRoute({
  method: "post",
  path: "/{id}/quantity",
  tags: [TAG],
  request: {
    params: idParamSchema,
    body: {
      content: { "application/json": { schema: setCardTradeQuantitySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Resized",
    },
  },
});

const syncTradeRoute = createRoute({
  method: "post",
  path: "/{id}/sync",
  tags: [TAG],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: cardTradeSyncSchema } }, required: false },
  },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Synced",
    },
  },
});

const skipSyncTradeRoute = createRoute({
  method: "post",
  path: "/{id}/sync/skip",
  tags: [TAG],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardTradeResponseSchema } },
      description: "Skipped",
    },
  },
});

const cardTradesApp = createApiApp().basePath("/trades");
cardTradesApp.use(requireAuth);

export const cardTradesRoute = cardTradesApp
  // ── POST /trades ──────────────────────────────────────────────────────────
  .openapi(createTradeRoute, async (c) => {
    const repos = c.get("repos");
    const { createTrade } = c.get("services");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const trade = await createTrade(repos, {
      callerUserId: userId,
      groupSlug: body.groupSlug,
      counterpartyUserId: body.counterpartyUserId,
      role: body.role,
      printingId: body.printingId,
      quantity: body.quantity,
    });
    return c.json(trade, 201);
  })

  // ── GET /trades ───────────────────────────────────────────────────────────
  .openapi(listTradesRoute, async (c) => {
    const { cardTrades } = c.get("repos");
    const userId = getUserId(c);
    const { groupId, status } = c.req.valid("query");
    const items = await cardTrades.listForUser(userId, { groupId, status });
    return c.json({ items } satisfies CardTradeListResponse);
  })

  // ── GET /trades/action-counts ───────────────────────────────────────────────
  .openapi(actionCountsRoute, async (c) => {
    const { cardTrades } = c.get("repos");
    const userId = getUserId(c);
    const byGroup = await cardTrades.actionNeededCountsForUser(userId);
    const total = byGroup.reduce((sum, entry) => sum + entry.count, 0);
    return c.json({ total, byGroup } satisfies CardTradeActionCountsResponse);
  })

  // ── POST /trades/:id/accept ──────────────────────────────────────────────────
  .openapi(acceptTradeRoute, async (c) => {
    const { acceptTrade } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    return c.json(await acceptTrade(transact, id, userId));
  })

  // ── POST /trades/:id/decline ─────────────────────────────────────────────────
  .openapi(declineTradeRoute, async (c) => {
    const { declineTrade } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    return c.json(await declineTrade(transact, id, userId));
  })

  // ── POST /trades/:id/cancel ──────────────────────────────────────────────────
  .openapi(cancelTradeRoute, async (c) => {
    const { cancelTrade } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    return c.json(await cancelTrade(transact, id, userId));
  })

  // ── POST /trades/:id/complete ────────────────────────────────────────────────
  .openapi(completeTradeRoute, async (c) => {
    const { completeTrade } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    return c.json(await completeTrade(transact, id, userId));
  })

  // ── POST /trades/:id/quantity ────────────────────────────────────────────────
  .openapi(setQuantityTradeRoute, async (c) => {
    const { setTradeQuantity } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { quantity } = c.req.valid("json");
    return c.json(await setTradeQuantity(transact, id, userId, quantity));
  })

  // ── POST /trades/:id/sync ────────────────────────────────────────────────────
  .openapi(syncTradeRoute, async (c) => {
    const { applyTradeSync } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await applyTradeSync(transact, id, userId, body?.targetCollectionId));
  })

  // ── POST /trades/:id/sync/skip ───────────────────────────────────────────────
  .openapi(skipSyncTradeRoute, async (c) => {
    const { skipTradeSync } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    return c.json(await skipTradeSync(transact, id, userId));
  });
