import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { WishListDetailResponse, WishListListResponse } from "@openrift/shared";
import {
  wishListDetailResponseSchema,
  wishListItemResponseSchema,
  wishListListResponseSchema,
  wishListResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createWishListItemSchema,
  createWishListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toWishList, toWishListItem } from "../../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

const listWishLists = createRoute({
  method: "get",
  path: "/",
  tags: ["Wish Lists"],
  responses: {
    200: {
      content: { "application/json": { schema: wishListListResponseSchema } },
      description: "Success",
    },
  },
});

const createWishList = createRoute({
  method: "post",
  path: "/",
  tags: ["Wish Lists"],
  request: {
    body: { content: { "application/json": { schema: createWishListSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: wishListResponseSchema } },
      description: "Created",
    },
  },
});

const getWishList = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Wish Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: wishListDetailResponseSchema } },
      description: "Success",
    },
  },
});

const updateWishList = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Wish Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateWishListSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: wishListResponseSchema } },
      description: "Success",
    },
  },
});

const deleteWishList = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Wish Lists"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const createWishListItem = createRoute({
  method: "post",
  path: "/{id}/items",
  tags: ["Wish Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: createWishListItemSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: wishListItemResponseSchema } },
      description: "Created",
    },
  },
});

const updateWishListItem = createRoute({
  method: "patch",
  path: "/{id}/items/{itemId}",
  tags: ["Wish Lists"],
  request: {
    params: idAndItemIdParamSchema,
    body: { content: { "application/json": { schema: updateWishListItemSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: wishListItemResponseSchema } },
      description: "Success",
    },
  },
});

const deleteWishListItem = createRoute({
  method: "delete",
  path: "/{id}/items/{itemId}",
  tags: ["Wish Lists"],
  request: { params: idAndItemIdParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const wishListsApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/wish-lists");
wishListsApp.use(requireAuth);
export const wishListsRoute = wishListsApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listWishLists, async (c) => {
    const { wishLists } = c.get("repos");
    const rows = await wishLists.listForUser(getUserId(c));
    return c.json({ items: rows.map((row) => toWishList(row)) } satisfies WishListListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createWishList, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await wishLists.create({
      userId: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    });
    return c.json(toWishList(row), 201);
  })

  // ── GET ONE (custom: returns wish list with items) ──────────────────────────
  .openapi(getWishList, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const wishList = await wishLists.getByIdForUser(id, userId);
    assertFound(wishList, "Not found");

    const itemRows = await wishLists.items(id, userId);

    const detail: WishListDetailResponse = {
      wishList: toWishList(wishList),
      items: itemRows.map((row) => toWishListItem(row)),
    };
    return c.json(detail);
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateWishList, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await wishLists.update(id, userId, updates);
    assertFound(row, "Not found");
    return c.json(toWishList(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteWishList, async (c) => {
    const { wishLists } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await wishLists.deleteByIdForUser(id, getUserId(c));
    assertDeleted(result, "Not found");
    return c.body(null, 204);
  })

  // ── POST /wish-lists/:id/items ────────────────────────────────────────────
  .openapi(createWishListItem, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id: wishListId } = c.req.valid("param");
    const body = c.req.valid("json");

    // Verify wish list belongs to user
    const wishList = await wishLists.exists(wishListId, userId);
    assertFound(wishList, "Wish list not found");

    const row = await wishLists.createItem({
      wishListId: wishListId,
      userId: userId,
      cardId: body.cardId ?? null,
      printingId: body.printingId ?? null,
      quantityDesired: body.quantityDesired,
    });

    return c.json(toWishListItem(row), 201);
  })

  // ── PATCH /wish-lists/:id/items/:itemId ───────────────────────────────────
  .openapi(updateWishListItem, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id: wishListId, itemId } = c.req.valid("param");
    const body = c.req.valid("json");

    const row = await wishLists.updateItem(itemId, wishListId, userId, {
      quantityDesired: body.quantityDesired,
    });

    assertFound(row, "Not found");

    return c.json(toWishListItem(row));
  })

  // ── DELETE /wish-lists/:id/items/:itemId ──────────────────────────────────
  .openapi(deleteWishListItem, async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id: wishListId, itemId } = c.req.valid("param");

    const result = await wishLists.deleteItem(itemId, wishListId, userId);
    assertDeleted(result, "Not found");

    return c.body(null, 204);
  });
