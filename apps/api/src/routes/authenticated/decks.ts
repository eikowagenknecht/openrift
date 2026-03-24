import { zValidator } from "@hono/zod-validator";
import type {
  DeckAvailabilityItemResponse,
  DeckAvailabilityResponse,
  DeckDetailResponse,
  DeckFormat,
  DeckListResponse,
  DeckZone,
} from "@openrift/shared";
import {
  createDeckSchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toDeck, toDeckAvailabilityItem, toDeckCard } from "../../utils/mappers.js";

const formatRules: Record<DeckFormat, { minMain?: number; maxSideboard?: number }> = {
  standard: { minMain: 40, maxSideboard: 8 },
  freeform: {},
};

function validateFormatRules(
  format: DeckFormat,
  cards: { zone: DeckZone; quantity: number }[],
): void {
  const rules = formatRules[format];
  if (!rules.minMain && !rules.maxSideboard) {
    return;
  }

  let mainCount = 0;
  let sideboardCount = 0;
  for (const entry of cards) {
    if (entry.zone === "main") {
      mainCount += entry.quantity;
    } else if (entry.zone === "sideboard") {
      sideboardCount += entry.quantity;
    }
  }

  if (rules.minMain && mainCount < rules.minMain) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      `${format[0].toUpperCase()}${format.slice(1)} format requires at least ${rules.minMain} main deck cards`,
    );
  }
  if (rules.maxSideboard && sideboardCount > rules.maxSideboard) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      `${format[0].toUpperCase()}${format.slice(1)} format allows at most ${rules.maxSideboard} sideboard cards`,
    );
  }
}

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  format: "format",
  isWanted: "isWanted",
  isPublic: "isPublic",
};

export const decksRoute = new Hono<{ Variables: Variables }>()
  .basePath("/decks")
  .use(requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/", zValidator("query", decksQuerySchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { wanted } = c.req.valid("query");
    const rows = await decks.listForUser(userId, wanted === "true");
    return c.json({ items: rows.map((row) => toDeck(row)) } satisfies DeckListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/", zValidator("json", createDeckSchema), async (c) => {
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
  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const [deck, cardRows] = await Promise.all([
      decks.getByIdForUser(id, userId),
      decks.cardsWithDetails(id, userId),
    ]);
    if (!deck) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const detail: DeckDetailResponse = {
      deck: toDeck(deck),
      cards: cardRows.map((r) => toDeckCard(r)),
    };
    return c.json(detail);
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/:id",
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
  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
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
    "/:id/cards",
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

      validateFormatRules(deck.format, body.cards);

      await decks.replaceCards(id, body.cards);

      const cardRows = await decks.cardsWithDetails(id, userId);
      return c.json({ cards: cardRows.map((r) => toDeckCard(r)) });
    },
  )

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .get("/:id/availability", zValidator("param", idParamSchema), async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.exists(id, userId);
    if (!deck) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const deckCards = await decks.cardRequirements(id);
    const cardIds = deckCards.map((dc) => dc.cardId);
    const availableCopies =
      cardIds.length > 0 ? await decks.availableCopiesByCard(userId, cardIds) : [];

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

    return c.json({ items: availability } satisfies DeckAvailabilityResponse);
  });
