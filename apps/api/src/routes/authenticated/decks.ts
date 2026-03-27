import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  DeckAvailabilityItemResponse,
  DeckAvailabilityResponse,
  DeckDetailResponse,
  DeckFormat,
  DeckListResponse,
  DeckZone,
} from "@openrift/shared";
import {
  deckAvailabilityResponseSchema,
  deckCardsResponseSchema,
  deckDetailResponseSchema,
  deckListResponseSchema,
  deckResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createDeckSchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";

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

const listDecks = createRoute({
  method: "get",
  path: "/",
  tags: ["Decks"],
  request: { query: decksQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckListResponseSchema } },
      description: "Success",
    },
  },
});

const createDeck = createRoute({
  method: "post",
  path: "/",
  tags: ["Decks"],
  request: {
    body: { content: { "application/json": { schema: createDeckSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: deckResponseSchema } },
      description: "Created",
    },
  },
});

const getDeck = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckDetailResponseSchema } },
      description: "Success",
    },
  },
});

const updateDeck = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Decks"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateDeckSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckResponseSchema } },
      description: "Success",
    },
  },
});

const deleteDeck = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const replaceDeckCards = createRoute({
  method: "put",
  path: "/{id}/cards",
  tags: ["Decks"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateDeckCardsSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCardsResponseSchema } },
      description: "Success",
    },
  },
});

const getDeckAvailability = createRoute({
  method: "get",
  path: "/{id}/availability",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckAvailabilityResponseSchema } },
      description: "Success",
    },
  },
});

const decksApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/decks");
decksApp.use(requireAuth);
export const decksRoute = decksApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listDecks, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { wanted } = c.req.valid("query");
    const rows = await decks.listForUser(userId, wanted === "true");
    return c.json({ items: rows.map((row) => toDeck(row)) } satisfies DeckListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createDeck, async (c) => {
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
  .openapi(getDeck, async (c) => {
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
  .openapi(updateDeck, async (c) => {
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
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteDeck, async (c) => {
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
  .openapi(replaceDeckCards, async (c) => {
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
  })

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .openapi(getDeckAvailability, async (c) => {
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
