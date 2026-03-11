import type { WishList, WishListItem } from "@openrift/shared";
import {
  createWishListItemSchema,
  createWishListSchema,
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
import type { Variables } from "../types.js";

export const wishListsRoute = new Hono<{ Variables: Variables }>();

wishListsRoute.use("/wish-lists/*", requireAuth);
wishListsRoute.use("/wish-lists", requireAuth);

function toWishList(row: {
  id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
}): WishList {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules,
    shareToken: row.share_token,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toWishListItem(row: {
  id: string;
  wish_list_id: string;
  card_id: string | null;
  printing_id: string | null;
  quantity_desired: number;
}): WishListItem {
  return {
    id: row.id,
    wishListId: row.wish_list_id,
    cardId: row.card_id,
    printingId: row.printing_id,
    quantityDesired: row.quantity_desired,
  };
}

// ── GET /wish-lists ───────────────────────────────────────────────────────────

wishListsRoute.get("/wish-lists", async (c) => {
  const userId = getUserId(c);

  const rows = await db
    .selectFrom("wish_lists")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("name")
    .execute();

  return c.json(rows.map((row) => toWishList(row)));
});

// ── POST /wish-lists ──────────────────────────────────────────────────────────

wishListsRoute.post("/wish-lists", async (c) => {
  const userId = getUserId(c);
  const body = createWishListSchema.parse(await c.req.json());

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("wish_lists")
    .values({
      id,
      user_id: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toWishList(row), 201);
});

// ── GET /wish-lists/:id ───────────────────────────────────────────────────────

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

// ── PATCH /wish-lists/:id ─────────────────────────────────────────────────────

wishListsRoute.patch("/wish-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateWishListSchema.parse(await c.req.json());

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.rules !== undefined) {
    updates.rules = body.rules ? JSON.stringify(body.rules) : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No fields to update");
  }

  updates.updated_at = new Date();

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
});

// ── DELETE /wish-lists/:id ────────────────────────────────────────────────────

wishListsRoute.delete("/wish-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const result = await db
    .deleteFrom("wish_lists")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json({ ok: true });
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
