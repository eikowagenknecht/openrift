import { zValidator } from "@hono/zod-validator";
import {
  createWishListItemSchema,
  createWishListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { wishListsRepo } from "../repositories/wish-lists.js";
import type { Variables } from "../types.js";
import { toWishList, toWishListItem } from "../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

export const wishListsRoute = new Hono<{ Variables: Variables }>()
  .use("/wish-lists/*", requireAuth)
  .use("/wish-lists", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/wish-lists", async (c) => {
    const wishLists = wishListsRepo(c.get("db"));
    const rows = await wishLists.listForUser(getUserId(c));
    return c.json(rows.map((row) => toWishList(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/wish-lists", zValidator("json", createWishListSchema), async (c) => {
    const wishLists = wishListsRepo(c.get("db"));
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await wishLists.create({
      userId: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    });
    return c.json(toWishList(row as object), 201);
  })

  // ── GET ONE (custom: returns wish list with items) ──────────────────────────
  .get("/wish-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const wishLists = wishListsRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const wishList = await wishLists.getByIdForUser(id, userId);
    if (!wishList) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await wishLists.itemsForList(id);

    return c.json({
      wishList: toWishList(wishList),
      items: itemRows.map((row) => toWishListItem(row)),
    });
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/wish-lists/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateWishListSchema),
    async (c) => {
      const wishLists = wishListsRepo(c.get("db"));
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
  .delete("/wish-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const wishLists = wishListsRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const result = await wishLists.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json({ ok: true });
  })

  // ── POST /wish-lists/:id/items ────────────────────────────────────────────
  .post(
    "/wish-lists/:id/items",
    zValidator("param", idParamSchema),
    zValidator("json", createWishListItemSchema),
    async (c) => {
      const wishLists = wishListsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id: wishListId } = c.req.valid("param");
      const body = c.req.valid("json");

      // Validate XOR constraint
      if ((!body.cardId && !body.printingId) || (body.cardId && body.printingId)) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "Exactly one of cardId or printingId must be provided",
        );
      }

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
    "/wish-lists/:id/items/:itemId",
    zValidator("param", idAndItemIdParamSchema),
    zValidator("json", updateWishListItemSchema),
    async (c) => {
      const wishLists = wishListsRepo(c.get("db"));
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
  .delete(
    "/wish-lists/:id/items/:itemId",
    zValidator("param", idAndItemIdParamSchema),
    async (c) => {
      const wishLists = wishListsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id: wishListId, itemId } = c.req.valid("param");

      const result = await wishLists.deleteItem(itemId, wishListId, userId);

      if (result.numDeletedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      return c.json({ ok: true });
    },
  );
