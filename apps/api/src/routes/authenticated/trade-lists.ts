import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { TradeListDetailResponse, TradeListListResponse } from "@openrift/shared";
import {
  tradeListDetailResponseSchema,
  tradeListItemResponseSchema,
  tradeListListResponseSchema,
  tradeListResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createTradeListItemSchema,
  createTradeListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  updateTradeListSchema,
} from "@openrift/shared/schemas";

import { AppError, ERROR_CODES } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toTradeList, toTradeListItem, toTradeListItemDetail } from "../../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

const listTradeLists = createRoute({
  method: "get",
  path: "/",
  tags: ["Trade Lists"],
  responses: {
    200: {
      content: { "application/json": { schema: tradeListListResponseSchema } },
      description: "Success",
    },
  },
});

const createTradeList = createRoute({
  method: "post",
  path: "/",
  tags: ["Trade Lists"],
  request: {
    body: { content: { "application/json": { schema: createTradeListSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: tradeListResponseSchema } },
      description: "Created",
    },
  },
});

const getTradeList = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Trade Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: tradeListDetailResponseSchema } },
      description: "Success",
    },
  },
});

const updateTradeList = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Trade Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateTradeListSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: tradeListResponseSchema } },
      description: "Success",
    },
  },
});

const deleteTradeList = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Trade Lists"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const createTradeListItemRoute = createRoute({
  method: "post",
  path: "/{id}/items",
  tags: ["Trade Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: createTradeListItemSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: tradeListItemResponseSchema } },
      description: "Created",
    },
  },
});

const deleteTradeListItem = createRoute({
  method: "delete",
  path: "/{id}/items/{itemId}",
  tags: ["Trade Lists"],
  request: { params: idAndItemIdParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const tradeListsApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/trade-lists");
tradeListsApp.use(requireAuth);
export const tradeListsRoute = tradeListsApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listTradeLists, async (c) => {
    const { tradeLists } = c.get("repos");
    const rows = await tradeLists.listForUser(getUserId(c));
    return c.json({
      items: rows.map((row) => toTradeList(row)),
    } satisfies TradeListListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createTradeList, async (c) => {
    const { tradeLists } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await tradeLists.create({
      userId: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    });
    return c.json(toTradeList(row), 201);
  })

  // ── GET ONE (custom: returns trade list with enriched items) ────────────────
  .openapi(getTradeList, async (c) => {
    const { tradeLists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const tradeList = await tradeLists.getByIdForUser(id, userId);
    if (!tradeList) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    const itemRows = await tradeLists.itemsWithDetails(id, userId);

    const detail: TradeListDetailResponse = {
      tradeList: toTradeList(tradeList),
      items: itemRows.map((row) => toTradeListItemDetail(row)),
    };
    return c.json(detail);
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateTradeList, async (c) => {
    const { tradeLists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await tradeLists.update(id, userId, updates);
    if (!row) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    return c.json(toTradeList(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteTradeList, async (c) => {
    const { tradeLists } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await tradeLists.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    return c.body(null, 204);
  })

  // ── POST /trade-lists/:id/items ───────────────────────────────────────────
  .openapi(createTradeListItemRoute, async (c) => {
    const { tradeLists, copies } = c.get("repos");
    const userId = getUserId(c);
    const { id: tradeListId } = c.req.valid("param");
    const body = c.req.valid("json");

    // Verify trade list belongs to user
    const tradeList = await tradeLists.exists(tradeListId, userId);
    if (!tradeList) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Trade list not found");
    }

    // Verify copy belongs to user
    const copy = await copies.existsForUser(body.copyId, userId);
    if (!copy) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Copy not found");
    }

    const row = await tradeLists.createItem({
      tradeListId: tradeListId,
      userId: userId,
      copyId: body.copyId,
    });

    return c.json(toTradeListItem(row), 201);
  })

  // ── DELETE /trade-lists/:id/items/:itemId ─────────────────────────────────
  .openapi(deleteTradeListItem, async (c) => {
    const { tradeLists } = c.get("repos");
    const userId = getUserId(c);
    const { id: tradeListId, itemId } = c.req.valid("param");

    const result = await tradeLists.deleteItem(itemId, tradeListId, userId);

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    return c.body(null, 204);
  });
