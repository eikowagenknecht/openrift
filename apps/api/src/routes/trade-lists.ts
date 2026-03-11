import type { TradeList, TradeListItem } from "@openrift/shared";
import {
  createTradeListItemSchema,
  createTradeListSchema,
  updateTradeListSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl } from "../db-helpers.js";
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

export const tradeListsRoute = new Hono<{ Variables: Variables }>();

tradeListsRoute.use("/trade-lists/*", requireAuth);
tradeListsRoute.use("/trade-lists", requireAuth);

function toTradeList(row: {
  id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
}): TradeList {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules,
    shareToken: row.share_token,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toTradeListItem(row: {
  id: string;
  trade_list_id: string;
  copy_id: string;
}): TradeListItem {
  return {
    id: row.id,
    tradeListId: row.trade_list_id,
    copyId: row.copy_id,
  };
}

// ── GET /trade-lists ──────────────────────────────────────────────────────────

tradeListsRoute.get("/trade-lists", async (c) => {
  const userId = getUserId(c);

  const rows = await db
    .selectFrom("trade_lists")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("name")
    .execute();

  return c.json(rows.map((row) => toTradeList(row)));
});

// ── POST /trade-lists ─────────────────────────────────────────────────────────

tradeListsRoute.post("/trade-lists", async (c) => {
  const userId = getUserId(c);
  const body = createTradeListSchema.parse(await c.req.json());

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("trade_lists")
    .values({
      id,
      user_id: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toTradeList(row), 201);
});

// ── GET /trade-lists/:id ──────────────────────────────────────────────────────

tradeListsRoute.get("/trade-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const tradeList = await db
    .selectFrom("trade_lists")
    .selectAll()
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!tradeList) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  const itemRows = await db
    .selectFrom("trade_list_items as tli")
    .innerJoin("copies as cp", "cp.id", "tli.copy_id")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .innerJoin("cards as card", "card.id", "p.card_id")
    .leftJoin("printing_images as pi", (join) =>
      join
        .onRef("pi.printing_id", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.is_active", "=", true),
    )
    .select([
      "tli.id",
      "tli.trade_list_id",
      "tli.copy_id",
      "cp.printing_id",
      "cp.collection_id",
      imageUrl("pi").as("image_url"),
      "p.set_id",
      "p.collector_number",
      "p.rarity",
      "p.finish",
      "card.name as card_name",
      "card.type as card_type",
    ])
    .where("tli.trade_list_id", "=", id)
    .orderBy("card.name")
    .execute();

  return c.json({
    tradeList: toTradeList(tradeList),
    items: itemRows.map((row) => ({
      ...toTradeListItem(row),
      printingId: row.printing_id,
      collectionId: row.collection_id,
      imageUrl: row.image_url,
      setId: row.set_id,
      collectorNumber: row.collector_number,
      rarity: row.rarity,
      finish: row.finish,
      cardName: row.card_name,
      cardType: row.card_type,
    })),
  });
});

// ── PATCH /trade-lists/:id ────────────────────────────────────────────────────

tradeListsRoute.patch("/trade-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateTradeListSchema.parse(await c.req.json());

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
    .updateTable("trade_lists")
    .set(updates)
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(toTradeList(row));
});

// ── DELETE /trade-lists/:id ───────────────────────────────────────────────────

tradeListsRoute.delete("/trade-lists/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const result = await db
    .deleteFrom("trade_lists")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json({ ok: true });
});

// ── POST /trade-lists/:id/items ───────────────────────────────────────────────

tradeListsRoute.post("/trade-lists/:id/items", async (c) => {
  const userId = getUserId(c);
  const tradeListId = c.req.param("id");
  const body = createTradeListItemSchema.parse(await c.req.json());

  // Verify trade list belongs to user
  const tradeList = await db
    .selectFrom("trade_lists")
    .select("id")
    .where("id", "=", tradeListId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!tradeList) {
    throw new AppError(404, "NOT_FOUND", "Trade list not found");
  }

  // Verify copy belongs to user
  const copy = await db
    .selectFrom("copies")
    .select("id")
    .where("id", "=", body.copyId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!copy) {
    throw new AppError(404, "NOT_FOUND", "Copy not found");
  }

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("trade_list_items")
    .values({
      id,
      trade_list_id: tradeListId,
      user_id: userId,
      copy_id: body.copyId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toTradeListItem(row), 201);
});

// ── DELETE /trade-lists/:id/items/:itemId ─────────────────────────────────────

tradeListsRoute.delete("/trade-lists/:id/items/:itemId", async (c) => {
  const userId = getUserId(c);
  const tradeListId = c.req.param("id");
  const itemId = c.req.param("itemId");

  const result = await db
    .deleteFrom("trade_list_items")
    .where("id", "=", itemId)
    .where("trade_list_id", "=", tradeListId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json({ ok: true });
});
