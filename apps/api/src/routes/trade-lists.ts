import {
  createTradeListItemSchema,
  createTradeListSchema,
  updateTradeListSchema,
} from "@openrift/shared/schemas";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { createCrudRoute } from "../crud-factory.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl } from "../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toTradeList, toTradeListItem } from "../utils/dto.js";

export const tradeListsRoute = createCrudRoute({
  path: "/trade-lists",
  table: "trade_lists",
  toDto: toTradeList,
  createSchema: createTradeListSchema,
  updateSchema: updateTradeListSchema,
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

// ── GET /trade-lists/:id ──────────────────────────────────────────────────────
// Returns trade list with enriched items (card info, images)

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
