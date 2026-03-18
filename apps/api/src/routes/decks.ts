import { zValidator } from "@hono/zod-validator";
import type { DeckAvailabilityItemResponse, DeckDetailResponse } from "@openrift/shared";
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
import type { Variables } from "../types.js";
import { toDeck, toDeckAvailabilityItem, toDeckCard } from "../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  format: "format",
  isWanted: "isWanted",
  isPublic: "isPublic",
};

export const decksRoute = new Hono<{ Variables: Variables }>()
  .use("/decks/*", requireAuth)
  .use("/decks", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/decks", zValidator("query", decksQuerySchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { wanted } = c.req.valid("query");
    const rows = await decks.listForUser(userId, wanted === "true");
    return c.json(rows.map((row) => toDeck(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/decks", zValidator("json", createDeckSchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await decks.create({
      userId,
      name: body.name,
      description: body.description ?? null,
      format: body.format,
      isWanted: body.isWanted ?? false,
      isPublic: body.isPublic ?? false,
    });
    return c.json(toDeck(row), 201);
  })

  // ── GET ONE (custom: returns deck with deck_cards joined) ───────────────────
  .get("/decks/:id", zValidator("param", idParamSchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.getByIdForUser(id, userId);
    if (!deck) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const cardRows = await decks.cardsWithDetails(id, userId);

    const detail: DeckDetailResponse = {
      deck: toDeck(deck),
      cards: cardRows.map((r) => toDeckCard(r)),
    };
    return c.json(detail);
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/decks/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateDeckSchema),
    async (c) => {
      const { decks } = c.get("repos");
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
    const { decks } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await decks.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.body(null, 204);
  })

  // ── PUT /decks/:id/cards ──────────────────────────────────────────────────
  // Full replace of deck cards
  .put(
    "/decks/:id/cards",
    zValidator("param", idParamSchema),
    zValidator("json", updateDeckCardsSchema),
    async (c) => {
      const { decks } = c.get("repos");
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

      await decks.replaceCards(id, body.cards);

      return c.body(null, 204);
    },
  )

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .get("/decks/:id/availability", zValidator("param", idParamSchema), async (c) => {
    const { decks } = c.get("repos");
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
      ownedByCard.set(row.cardId, row.count);
    }

    const availability: DeckAvailabilityItemResponse[] = deckCards.map((dc) =>
      toDeckAvailabilityItem({
        cardId: dc.cardId,
        zone: dc.zone,
        needed: dc.quantity,
        owned: ownedByCard.get(dc.cardId) ?? 0,
        shortfall: Math.max(0, dc.quantity - (ownedByCard.get(dc.cardId) ?? 0)),
      }),
    );

    return c.json(availability);
  });
