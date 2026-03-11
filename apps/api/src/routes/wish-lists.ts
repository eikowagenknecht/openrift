import {
  createWishListItemSchema,
  createWishListSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "@openrift/shared/schemas";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { createCrudRoute } from "../crud-factory.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toWishList, toWishListItem } from "../utils/dto.js";

export const wishListsRoute = createCrudRoute({
  path: "/wish-lists",
  table: "wish_lists",
  toDto: toWishList,
  createSchema: createWishListSchema,
  updateSchema: updateWishListSchema,
  toInsert: (body) => ({
    name: body.name,
    rules: body.rules ? JSON.stringify(body.rules) : null,
  }),
  patchFields: {
    name: "name",
    rules: (v) => ["rules", v ? JSON.stringify(v) : null],
  },
  skip: ["getOne"],
});

// ── GET /wish-lists/:id ───────────────────────────────────────────────────────
// Returns wish list with its items

wishListsRoute.get("/wish-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

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
});

// ── POST /wish-lists/:id/items ────────────────────────────────────────────────

wishListsRoute.post("/wish-lists/:id/items", async (c) => {
  const userId = getUserId(c);
  const wishListId = c.req.param("id");
  const body = createWishListItemSchema.parse(await c.req.json());

  // Validate XOR constraint
  if ((!body.cardId && !body.printingId) || (body.cardId && body.printingId)) {
    throw new AppError(400, "BAD_REQUEST", "Exactly one of cardId or printingId must be provided");
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

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("wish_list_items")
    .values({
      id,
      wish_list_id: wishListId,
      user_id: userId,
      card_id: body.cardId ?? null,
      printing_id: body.printingId ?? null,
      quantity_desired: body.quantityDesired,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toWishListItem(row), 201);
});

// ── PATCH /wish-lists/:id/items/:itemId ───────────────────────────────────────

wishListsRoute.patch("/wish-lists/:id/items/:itemId", async (c) => {
  const userId = getUserId(c);
  const wishListId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const body = updateWishListItemSchema.parse(await c.req.json());

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
});

// ── DELETE /wish-lists/:id/items/:itemId ──────────────────────────────────────

wishListsRoute.delete("/wish-lists/:id/items/:itemId", async (c) => {
  const userId = getUserId(c);
  const wishListId = c.req.param("id");
  const itemId = c.req.param("itemId");

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
});
