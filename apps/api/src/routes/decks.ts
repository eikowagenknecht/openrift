import { zValidator } from "@hono/zod-validator";
import type { DeckZone } from "@openrift/shared";
import {
  createDeckSchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { decksRepo } from "../repositories/decks.js";
import type { Variables } from "../types.js";
import { toDeck } from "../utils/dto.js";

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  format: "format",
  isWanted: "is_wanted",
  isPublic: "is_public",
};

export const decksRoute = new Hono<{ Variables: Variables }>()
  .use("/decks/*", requireAuth)
  .use("/decks", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/decks", zValidator("query", decksQuerySchema), async (c) => {
    const decks = decksRepo(c.get("db"));
    const userId = getUserId(c);
    const { wanted } = c.req.valid("query");
    const rows = await decks.listForUser(userId, wanted === "true");
    return c.json(rows.map((row) => toDeck(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/decks", zValidator("json", createDeckSchema), async (c) => {
    const decks = decksRepo(c.get("db"));
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await decks.create({
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
      format: body.format,
      is_wanted: body.isWanted ?? false,
      is_public: body.isPublic ?? false,
    });
    return c.json(toDeck(row), 201);
  })

  // ── GET ONE (custom: returns deck with deck_cards joined) ───────────────────
  .get("/decks/:id", zValidator("param", idParamSchema), async (c) => {
    const decks = decksRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.getByIdForUser(id, userId);
    if (!deck) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const cardRows = await decks.cardsWithDetails(id);

    return c.json({
      deck: toDeck(deck),
      cards: cardRows.map((r) => ({
        id: r.id,
        deckId: r.deck_id,
        cardId: r.card_id,
        zone: r.zone as DeckZone,
        quantity: r.quantity,
        cardName: r.card_name,
        cardType: r.card_type,
        domains: r.domains,
        energy: r.energy,
        might: r.might,
        power: r.power,
      })),
    });
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/decks/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateDeckSchema),
    async (c) => {
      const decks = decksRepo(c.get("db"));
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await decks.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toDeck(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/decks/:id", zValidator("param", idParamSchema), async (c) => {
    const decks = decksRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const result = await decks.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json({ ok: true });
  })

  // ── PUT /decks/:id/cards ──────────────────────────────────────────────────
  // Full replace of deck cards
  .put(
    "/decks/:id/cards",
    zValidator("param", idParamSchema),
    zValidator("json", updateDeckCardsSchema),
    async (c) => {
      const db = c.get("db");
      const decks = decksRepo(db);
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      // Verify deck belongs to user
      const deck = await decks.getIdAndFormat(id, userId);
      if (!deck) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      // Validate format rules
      if (deck.format === "standard") {
        const mainCount = body.cards
          .filter((entry) => entry.zone === "main")
          .reduce((sum, entry) => sum + entry.quantity, 0);
        const sideboardCount = body.cards
          .filter((entry) => entry.zone === "sideboard")
          .reduce((sum, entry) => sum + entry.quantity, 0);

        if (mainCount < 40) {
          throw new AppError(
            400,
            "BAD_REQUEST",
            "Standard format requires at least 40 main deck cards",
          );
        }
        if (sideboardCount > 8) {
          throw new AppError(
            400,
            "BAD_REQUEST",
            "Standard format allows at most 8 sideboard cards",
          );
        }
      }

      await db.transaction().execute(async (trx) => {
        // Delete existing cards
        await trx.deleteFrom("deck_cards").where("deck_id", "=", id).execute();

        // Insert new cards
        if (body.cards.length > 0) {
          await trx
            .insertInto("deck_cards")
            .values(
              body.cards.map((card) => ({
                deck_id: id,
                card_id: card.cardId,
                zone: card.zone,
                quantity: card.quantity,
              })),
            )
            .execute();
        }

        // Touch deck updated_at
        await trx
          .updateTable("decks")
          .set({ updated_at: new Date() })
          .where("id", "=", id)
          .execute();
      });

      return c.json({ ok: true });
    },
  )

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .get("/decks/:id/availability", zValidator("param", idParamSchema), async (c) => {
    const decks = decksRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.exists(id, userId);
    if (!deck) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const [deckCards, availableCopies] = await Promise.all([
      decks.cardRequirements(id),
      decks.availableCopiesByCard(userId),
    ]);

    const ownedByCard = new Map<string, number>();
    for (const row of availableCopies) {
      ownedByCard.set(row.card_id, Number(row.count));
    }

    const availability = deckCards.map((dc) => ({
      cardId: dc.card_id,
      zone: dc.zone,
      needed: dc.quantity,
      owned: ownedByCard.get(dc.card_id) ?? 0,
      shortfall: Math.max(0, dc.quantity - (ownedByCard.get(dc.card_id) ?? 0)),
    }));

    return c.json(availability);
  });
