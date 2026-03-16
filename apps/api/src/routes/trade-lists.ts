import { zValidator } from "@hono/zod-validator";
import {
  createTradeListItemSchema,
  createTradeListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  updateTradeListSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { tradeListsRepo } from "../repositories/trade-lists.js";
import type { Variables } from "../types.js";
import { toTradeList, toTradeListItem } from "../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  rules: (v) => ["rules", v ? JSON.stringify(v) : null],
};

export const tradeListsRoute = new Hono<{ Variables: Variables }>()
  .use("/trade-lists/*", requireAuth)
  .use("/trade-lists", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/trade-lists", async (c) => {
    const tradeLists = tradeListsRepo(c.get("db"));
    const rows = await tradeLists.listForUser(getUserId(c));
    return c.json(rows.map((row) => toTradeList(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/trade-lists", zValidator("json", createTradeListSchema), async (c) => {
    const tradeLists = tradeListsRepo(c.get("db"));
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await tradeLists.create({
      userId: userId,
      name: body.name,
      rules: body.rules ? JSON.stringify(body.rules) : null,
    });
    return c.json(toTradeList(row as object), 201);
  })

  // ── GET ONE (custom: returns trade list with enriched items) ────────────────
  .get("/trade-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const tradeLists = tradeListsRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const tradeList = await tradeLists.getByIdForUser(id, userId);
    if (!tradeList) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await tradeLists.itemsWithDetails(id);

    return c.json({
      tradeList: toTradeList(tradeList),
      items: itemRows.map((row) => ({
        ...toTradeListItem(row),
        printingId: row.printingId,
        collectionId: row.collectionId,
        imageUrl: row.imageUrl,
        setId: row.setId,
        collectorNumber: row.collectorNumber,
        rarity: row.rarity,
        finish: row.finish,
        cardName: row.cardName,
        cardType: row.cardType,
      })),
    });
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/trade-lists/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateTradeListSchema),
    async (c) => {
      const tradeLists = tradeListsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await tradeLists.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toTradeList(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/trade-lists/:id", zValidator("param", idParamSchema), async (c) => {
    const tradeLists = tradeListsRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const result = await tradeLists.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.body(null, 204);
  })

  // ── POST /trade-lists/:id/items ───────────────────────────────────────────
  .post(
    "/trade-lists/:id/items",
    zValidator("param", idParamSchema),
    zValidator("json", createTradeListItemSchema),
    async (c) => {
      const tradeLists = tradeListsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id: tradeListId } = c.req.valid("param");
      const body = c.req.valid("json");

      // Verify trade list belongs to user
      const tradeList = await tradeLists.exists(tradeListId, userId);
      if (!tradeList) {
        throw new AppError(404, "NOT_FOUND", "Trade list not found");
      }

      // Verify copy belongs to user
      const copy = await tradeLists.copyExistsForUser(body.copyId, userId);
      if (!copy) {
        throw new AppError(404, "NOT_FOUND", "Copy not found");
      }

      const row = await tradeLists.createItem({
        tradeListId: tradeListId,
        userId: userId,
        copyId: body.copyId,
      });

      return c.json(toTradeListItem(row), 201);
    },
  )

  // ── DELETE /trade-lists/:id/items/:itemId ─────────────────────────────────
  .delete(
    "/trade-lists/:id/items/:itemId",
    zValidator("param", idAndItemIdParamSchema),
    async (c) => {
      const tradeLists = tradeListsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id: tradeListId, itemId } = c.req.valid("param");

      const result = await tradeLists.deleteItem(itemId, tradeListId, userId);

      if (result.numDeletedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      return c.body(null, 204);
    },
  );
