import { zValidator } from "@hono/zod-validator";
import type { WishListDetailResponse, WishListListResponse } from "@openrift/shared";
import {
  createWishListItemSchema,
  createWishListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toWishList, toWishListItem } from "../../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

export const wishListsRoute = new Hono<{ Variables: Variables }>()
  .basePath("/wish-lists")
  .use(requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const { wishLists } = c.get("repos");
    const rows = await wishLists.listForUser(getUserId(c));
    return c.json({ items: rows.map((row) => toWishList(row)) } satisfies WishListListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/", zValidator("json", createWishListSchema), async (c) => {
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
  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const wishList = await wishLists.getByIdForUser(id, userId);
    if (!wishList) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await wishLists.items(id, userId);

    const detail: WishListDetailResponse = {
      wishList: toWishList(wishList),
      items: itemRows.map((row) => toWishListItem(row)),
    };
    return c.json(detail);
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateWishListSchema),
    async (c) => {
      const { wishLists } = c.get("repos");
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await wishLists.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toWishList(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const { wishLists } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await wishLists.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.body(null, 204);
  })

  // ── POST /wish-lists/:id/items ────────────────────────────────────────────
  .post(
    "/:id/items",
    zValidator("param", idParamSchema),
    zValidator("json", createWishListItemSchema),
    async (c) => {
      const { wishLists } = c.get("repos");
      const userId = getUserId(c);
      const { id: wishListId } = c.req.valid("param");
      const body = c.req.valid("json");

      // Verify wish list belongs to user
      const wishList = await wishLists.exists(wishListId, userId);
      if (!wishList) {
        throw new AppError(404, "NOT_FOUND", "Wish list not found");
      }

      const row = await wishLists.createItem({
        wishListId: wishListId,
        userId: userId,
        cardId: body.cardId ?? null,
        printingId: body.printingId ?? null,
        quantityDesired: body.quantityDesired,
      });

      return c.json(toWishListItem(row), 201);
    },
  )

  // ── PATCH /wish-lists/:id/items/:itemId ───────────────────────────────────
  .patch(
    "/:id/items/:itemId",
    zValidator("param", idAndItemIdParamSchema),
    zValidator("json", updateWishListItemSchema),
    async (c) => {
      const { wishLists } = c.get("repos");
      const userId = getUserId(c);
      const { id: wishListId, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const row = await wishLists.updateItem(itemId, wishListId, userId, {
        quantityDesired: body.quantityDesired,
      });

      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      return c.json(toWishListItem(row));
    },
  )

  // ── DELETE /wish-lists/:id/items/:itemId ──────────────────────────────────
  .delete("/:id/items/:itemId", zValidator("param", idAndItemIdParamSchema), async (c) => {
    const { wishLists } = c.get("repos");
    const userId = getUserId(c);
    const { id: wishListId, itemId } = c.req.valid("param");

    const result = await wishLists.deleteItem(itemId, wishListId, userId);

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    return c.body(null, 204);
  });
