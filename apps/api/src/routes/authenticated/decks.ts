import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  DeckAvailabilityItemResponse,
  DeckAvailabilityResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckImportPreviewResponse,
  DeckListResponse,
} from "@openrift/shared";
import { inferZone } from "@openrift/shared";
import {
  deckAvailabilityResponseSchema,
  deckCardsResponseSchema,
  deckDetailResponseSchema,
  deckExportResponseSchema,
  deckImportPreviewResponseSchema,
  deckListResponseSchema,
  deckResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createDeckSchema,
  deckExportQuerySchema,
  deckImportPreviewSchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";

import { AppError, ERROR_CODES } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import {
  decodeTTS,
  decodeText,
  encodeText,
  encodeTTS,
  piltoverCodec,
} from "../../services/deck-codecs/index.js";
import type { TextCodecCard } from "../../services/deck-codecs/index.js";
import type { Variables } from "../../types.js";
import { toDeck, toDeckAvailabilityItem, toDeckCard } from "../../utils/mappers.js";

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

const cloneDeck = createRoute({
  method: "post",
  path: "/{id}/clone",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: deckResponseSchema } },
      description: "Created",
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

const exportDeck = createRoute({
  method: "get",
  path: "/{id}/export",
  tags: ["Decks"],
  request: { params: idParamSchema, query: deckExportQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckExportResponseSchema } },
      description: "Deck code",
    },
  },
});

const importPreview = createRoute({
  method: "post",
  path: "/import-preview",
  tags: ["Decks"],
  request: {
    body: { content: { "application/json": { schema: deckImportPreviewSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckImportPreviewResponseSchema } },
      description: "Import preview",
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
    const { decks, marketplace, userPreferences } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const [deck, cardRows, prefs] = await Promise.all([
      decks.getByIdForUser(id, userId),
      decks.cardsWithDetails(id, userId),
      userPreferences.getByUserId(userId),
    ]);
    if (!deck) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    const favMarketplace =
      prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
    const deckValueMap = await marketplace.deckValues(userId, favMarketplace);

    const detail: DeckDetailResponse = {
      deck: toDeck(deck),
      cards: cardRows.map((r) => toDeckCard(r)),
      totalValueCents: deckValueMap.get(id) ?? null,
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
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    return c.json(toDeck(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteDeck, async (c) => {
    const { decks } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await decks.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
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
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    // Save the cards first, then validate the full deck with card details
    await decks.replaceCards(id, body.cards);

    const cardRows = await decks.cardsWithDetails(id, userId);

    return c.json({ cards: cardRows.map((r) => toDeckCard(r)) });
  })

  // ── POST /decks/:id/clone ─────────────────────────────────────────────────
  .openapi(cloneDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const newDeck = await decks.cloneDeck(id, userId);
    if (!newDeck) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    return c.json(toDeck(newDeck), 201);
  })

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .openapi(getDeckAvailability, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.exists(id, userId);
    if (!deck) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
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
  })

  // ── GET /decks/:id/export ────────────────────────────────────────────────
  // Encode a deck as a shareable deck code
  .openapi(exportDeck, async (c) => {
    const { decks, canonicalPrintings } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { format } = c.req.valid("query");

    const [deck, cardRows] = await Promise.all([
      decks.getByIdForUser(id, userId),
      decks.cardsWithDetails(id, userId),
    ]);
    if (!deck) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    const cardIds = [...new Set(cardRows.map((row) => row.cardId))];
    const shortCodes = await canonicalPrintings.canonicalShortCodesByCardIds(cardIds);
    const shortCodeMap = new Map(shortCodes.map((sc) => [sc.cardId, sc.shortCode]));

    const warnings: string[] = [];
    const codecCards: TextCodecCard[] = [];
    for (const row of cardRows) {
      const shortCode = shortCodeMap.get(row.cardId);
      if (!shortCode) {
        warnings.push(`Skipped "${row.cardName}": no canonical printing found`);
        continue;
      }
      codecCards.push({
        cardId: row.cardId,
        shortCode,
        zone: row.zone,
        quantity: row.quantity,
        cardType: row.cardType,
        superTypes: row.superTypes,
        domains: row.domains,
        cardName: row.cardName,
      });
    }

    let result;
    if (format === "text") {
      result = encodeText(codecCards);
    } else if (format === "tts") {
      result = encodeTTS(codecCards);
    } else {
      result = piltoverCodec.encode(codecCards);
    }

    return c.json({
      code: result.code,
      warnings: [...warnings, ...result.warnings],
    } satisfies DeckExportResponse);
  })

  // ── POST /decks/import-preview ───────────────────────────────────────────
  // Decode a deck code and return resolved cards with inferred zones
  .openapi(importPreview, async (c) => {
    const { canonicalPrintings } = c.get("repos");
    const body = c.req.valid("json");
    const format = body.format ?? "piltover";

    if (format === "text") {
      const decoded = decodeText(body.code);
      const cardNames = decoded.cards.map((card) => card.cardName);
      const resolved = await canonicalPrintings.cardIdsByNames(cardNames);
      const resolvedMap = new Map(resolved.map((row) => [row.cardName.toLowerCase(), row]));

      const warnings = [...decoded.warnings];
      const cards: DeckImportPreviewResponse["cards"] = [];

      for (const entry of decoded.cards) {
        const card = resolvedMap.get(entry.cardName.toLowerCase());
        if (!card) {
          warnings.push(`Unknown card: "${entry.cardName}" (skipped)`);
          continue;
        }

        cards.push({
          cardId: card.cardId,
          shortCode: card.shortCode,
          zone: entry.zone,
          quantity: entry.count,
          cardName: card.cardName,
          cardType: card.cardType,
          superTypes: card.superTypes,
          domains: card.domains,
        });
      }

      return c.json({ cards, warnings } satisfies DeckImportPreviewResponse);
    }

    // Piltover and TTS both decode to short codes with source slots
    let decoded;
    try {
      decoded = format === "tts" ? decodeTTS(body.code) : piltoverCodec.decode(body.code);
    } catch {
      throw new AppError(400, ERROR_CODES.INVALID_DECK_CODE, "Invalid or unsupported deck code");
    }

    const shortCodes = decoded.cards.map((card) => card.cardCode);
    const resolved = await canonicalPrintings.cardIdsByShortCodes(shortCodes);
    const resolvedMap = new Map(resolved.map((row) => [row.shortCode, row]));

    const warnings = [...decoded.warnings];
    const cards: DeckImportPreviewResponse["cards"] = [];

    for (const entry of decoded.cards) {
      const card = resolvedMap.get(entry.cardCode);
      if (!card) {
        warnings.push(`Unknown card: ${entry.cardCode} (skipped)`);
        continue;
      }

      const zone = inferZone(card.cardType, card.superTypes, entry.sourceSlot);

      cards.push({
        cardId: card.cardId,
        shortCode: entry.cardCode,
        zone,
        quantity: entry.count,
        cardName: card.cardName,
        cardType: card.cardType,
        superTypes: card.superTypes,
        domains: card.domains,
      });
    }

    return c.json({ cards, warnings } satisfies DeckImportPreviewResponse);
  });
