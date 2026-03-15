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

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { buildPatchUpdates } from "../patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { FieldMapping } from "../patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toWishList, toWishListItem } from "../utils/dto.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

export const wishListsRoute = new Hono<{ Variables: Variables }>()
  .use("/wish-lists/*", requireAuth)
  .use("/wish-lists", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/wish-lists", async (c) => {
    const userId = getUserId(c);
    const rows = await db
      .selectFrom("wish_lists")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("name")
      .execute();
    return c.json(rows.map((row) => toWishList(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/wish-lists", zValidator("json", createWishListSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await db
      .insertInto("wish_lists")
      .values({
        user_id: userId,
        name: body.name,
        rules: body.rules ? JSON.stringify(body.rules) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json(toWishList(row as object), 201);
  })

  // ── GET ONE (custom: returns wish list with items) ──────────────────────────
  .get("/wish-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const wishList = await db
      .selectFrom("wish_lists")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!wishList) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await db
      .selectFrom("wish_list_items")
      .selectAll()
      .where("wish_list_id", "=", id)
      .execute();

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
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await db
        .updateTable("wish_lists")
        .set(updates)
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toWishList(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/wish-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const result = await db
      .deleteFrom("wish_lists")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
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
      const wishList = await db
        .selectFrom("wish_lists")
        .select("id")
        .where("id", "=", wishListId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (!wishList) {
        throw new AppError(404, "NOT_FOUND", "Wish list not found");
      }

      const row = await db
        .insertInto("wish_list_items")
        .values({
          wish_list_id: wishListId,
          user_id: userId,
          card_id: body.cardId ?? null,
          printing_id: body.printingId ?? null,
          quantity_desired: body.quantityDesired,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return c.json(toWishListItem(row), 201);
    },
  )

  // ── PATCH /wish-lists/:id/items/:itemId ───────────────────────────────────
  .patch(
    "/wish-lists/:id/items/:itemId",
    zValidator("param", idAndItemIdParamSchema),
    zValidator("json", updateWishListItemSchema),
    async (c) => {
      const userId = getUserId(c);
      const { id: wishListId, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const row = await db
        .updateTable("wish_list_items")
        .set({ quantity_desired: body.quantityDesired })
        .where("id", "=", itemId)
        .where("wish_list_id", "=", wishListId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();

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
      const userId = getUserId(c);
      const { id: wishListId, itemId } = c.req.valid("param");

      const result = await db
        .deleteFrom("wish_list_items")
        .where("id", "=", itemId)
        .where("wish_list_id", "=", wishListId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      return c.json({ ok: true });
    },
  );
