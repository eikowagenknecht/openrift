import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  CardType,
  DeckAvailabilityItemResponse,
  DeckAvailabilityResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckImportPreviewResponse,
  DeckListItemResponse,
  DeckListResponse,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import { inferZone, validateDeck } from "@openrift/shared";
import {
  deckAvailabilityResponseSchema,
  deckCardsResponseSchema,
  deckCloneResponseSchema,
  deckDetailResponseSchema,
  deckExportResponseSchema,
  deckImportPreviewResponseSchema,
  deckListResponseSchema,
  deckResponseSchema,
  deckShareResponseSchema,
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
import { z } from "zod";

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
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toDeck, toDeckAvailabilityItem, toDeckCard, toDeckSummary } from "../../utils/mappers.js";

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

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const SHARE_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHARE_TOKEN_LENGTH = 12;

/**
 * Generates an unguessable base62 share token. 12 chars × log2(62) ≈ 71 bits
 * of entropy. Unbiased via rejection sampling: we only accept bytes below the
 * largest multiple of 62 that fits in a byte (248).
 * @returns A 12-character base62 token.
 */
function generateShareToken(): string {
  const threshold = Math.floor(256 / SHARE_TOKEN_ALPHABET.length) * SHARE_TOKEN_ALPHABET.length;
  const out: string[] = [];
  const buf = new Uint8Array(SHARE_TOKEN_LENGTH * 2);
  while (out.length < SHARE_TOKEN_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < threshold) {
        out.push(SHARE_TOKEN_ALPHABET[byte % SHARE_TOKEN_ALPHABET.length]);
        if (out.length === SHARE_TOKEN_LENGTH) {
          break;
        }
      }
    }
  }
  return out.join("");
}

const pinDeckBodySchema = z.object({ isPinned: z.boolean() });
const archiveDeckBodySchema = z.object({ archived: z.boolean() });

const setDeckPinned = createRoute({
  method: "patch",
  path: "/{id}/pin",
  tags: ["Decks"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: pinDeckBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckResponseSchema } },
      description: "Updated",
    },
  },
});

const setDeckArchived = createRoute({
  method: "patch",
  path: "/{id}/archive",
  tags: ["Decks"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: archiveDeckBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckResponseSchema } },
      description: "Updated",
    },
  },
});

const shareDeck = createRoute({
  method: "post",
  path: "/{id}/share",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckShareResponseSchema } },
      description: "Shared",
    },
  },
});

const unshareDeck = createRoute({
  method: "delete",
  path: "/{id}/share",
  tags: ["Decks"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const cloneSharedDeck = createRoute({
  method: "post",
  path: "/share/{token}/clone",
  tags: ["Decks"],
  request: { params: shareTokenParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: deckCloneResponseSchema } },
      description: "Cloned",
    },
  },
});

const decksApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/decks");
decksApp.use(requireAuth);
export const decksRoute = decksApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listDecks, async (c) => {
    const { decks, marketplace, userPreferences, enums } = c.get("repos");
    const userId = getUserId(c);
    const { wanted, includeArchived } = c.req.valid("query");

    const [deckRows, allCards, prefs, enumRows] = await Promise.all([
      decks.listForUser(userId, {
        wantedOnly: wanted === "true",
        includeArchived: includeArchived === "true",
      }),
      decks.allCardsForUser(userId),
      userPreferences.getByUserId(userId),
      enums.all(),
    ]);

    const favMarketplace =
      prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
    const deckValueMap = await marketplace.deckValues(userId, favMarketplace);

    // Group cards by deck
    const cardsByDeckId = Map.groupBy(allCards, (card) => card.deckId);

    const cardTypeOrder = enumRows.cardTypes.map((row) => row.slug);
    const domainOrder = enumRows.domains.map((row) => row.slug);
    const excludedTypes = new Set<string>(["Legend", "Rune", "Battlefield"]);
    const countedZones = new Set<string>(["main", "champion"]);

    const items: DeckListItemResponse[] = deckRows.map((row) => {
      const cards = cardsByDeckId.get(row.id) ?? [];
      const legend = cards.find((card) => card.zone === "legend");
      const champion = cards.find((card) => card.zone === "champion");

      // Total cards (excluding overflow)
      const totalCards = cards
        .filter((card) => card.zone !== "overflow")
        .reduce((sum, card) => sum + card.quantity, 0);

      // Type counts (Unit/Spell/Gear from main+champion zones)
      const typeCountMap = new Map<CardType, number>();
      for (const card of cards) {
        if (!countedZones.has(card.zone) || excludedTypes.has(card.cardType)) {
          continue;
        }
        typeCountMap.set(
          card.cardType as CardType,
          (typeCountMap.get(card.cardType as CardType) ?? 0) + card.quantity,
        );
      }
      const typeCounts = cardTypeOrder
        .filter((type) => typeCountMap.has(type as CardType))
        .map((type) => ({
          cardType: type as CardType,
          count: typeCountMap.get(type as CardType) ?? 0,
        }));

      // Domain distribution (from main+champion zones)
      const domainCountMap = new Map<Domain, number>();
      for (const card of cards) {
        if (!countedZones.has(card.zone)) {
          continue;
        }
        for (const domain of card.domains as Domain[]) {
          domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
        }
      }
      const domainDistribution = domainOrder
        .filter((domain) => domainCountMap.has(domain as Domain))
        .map((domain) => ({
          domain: domain as Domain,
          count: domainCountMap.get(domain as Domain) ?? 0,
        }));

      // Validation
      const isValid =
        row.format === "constructed"
          ? validateDeck({
              format: "constructed",
              cards: cards.map((card) => ({
                cardId: card.cardId,
                zone: card.zone as DeckZone,
                quantity: card.quantity,
                cardName: card.cardName,
                cardType: card.cardType as CardType,
                superTypes: card.superTypes as SuperType[],
                domains: card.domains as Domain[],
                tags: card.tags,
                keywords: card.keywords,
              })),
            }).length === 0
          : true;

      return {
        deck: toDeckSummary(row),
        legendCardId: legend?.cardId ?? null,
        championCardId: champion?.cardId ?? null,
        totalCards,
        typeCounts,
        domainDistribution,
        isValid,
        totalValueCents: deckValueMap.get(row.id) ?? null,
      };
    });

    return c.json({ items } satisfies DeckListResponse);
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
      format: body.format as DeckFormat,
      isWanted: body.isWanted ?? false,
      isPublic: body.isPublic ?? false,
    });
    return c.json(toDeck(row), 201);
  })

  // ── GET ONE ────────────────────────────────────────────────────────────────
  .openapi(getDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const [deck, cardRows] = await Promise.all([
      decks.getByIdForUser(id, userId),
      decks.cardsForDeck(id, userId),
    ]);
    assertFound(deck, "Not found");

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
    assertFound(row, "Not found");
    return c.json(toDeck(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteDeck, async (c) => {
    const { decks } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await decks.deleteByIdForUser(id, getUserId(c));
    assertDeleted(result, "Not found");
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
    assertFound(deck, "Not found");

    await decks.replaceCards(
      id,
      body.cards.map((card) => ({
        cardId: card.cardId,
        zone: card.zone as DeckZone,
        quantity: card.quantity,
        preferredPrintingId: card.preferredPrintingId ?? null,
      })),
    );

    const cardRows = await decks.cardsForDeck(id, userId);

    return c.json({ cards: cardRows.map((r) => toDeckCard(r)) });
  })

  // ── POST /decks/:id/clone ─────────────────────────────────────────────────
  .openapi(cloneDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const newDeck = await decks.cloneDeck(id, userId);
    assertFound(newDeck, "Not found");

    return c.json(toDeck(newDeck), 201);
  })

  // ── GET /decks/:id/availability ───────────────────────────────────────────
  // For a wanted deck, returns per-card availability from deckbuilding collections
  .openapi(getDeckAvailability, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const deck = await decks.exists(id, userId);
    assertFound(deck, "Not found");

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
    assertFound(deck, "Not found");

    const resolvedShortCodes = await canonicalPrintings.shortCodesForRows(
      cardRows.map((row) => ({
        cardId: row.cardId,
        preferredPrintingId: row.preferredPrintingId,
      })),
    );

    const warnings: string[] = [];
    const codecCards: TextCodecCard[] = [];
    for (const [index, row] of cardRows.entries()) {
      const shortCode = resolvedShortCodes[index]?.shortCode;
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
        preferredPrintingId: row.preferredPrintingId,
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

    // Each format decodes into a uniform entry list + a resolvedMap keyed by lookupKey.
    // Text format provides explicit zones; piltover/TTS provide sourceSlots for inference.
    interface ImportEntry {
      lookupKey: string;
      label: string;
      zone: DeckZone | null;
      sourceSlot: "mainDeck" | "sideboard" | "chosenChampion" | null;
      count: number;
    }
    let decodedWarnings: string[];
    let entries: ImportEntry[];
    let resolvedMap: Map<
      string,
      {
        cardId: string;
        shortCode: string;
        printingId: string;
        cardName: string;
        cardType: CardType;
        superTypes: SuperType[];
        domains: Domain[];
      }
    >;
    // Piltover and TTS codes carry variant-level printing info; text does not.
    const formatCarriesPrinting = format !== "text";

    if (format === "text") {
      const decoded = decodeText(body.code);
      decodedWarnings = decoded.warnings;
      entries = decoded.cards.map((card) => ({
        lookupKey: card.cardName.toLowerCase(),
        label: `"${card.cardName}"`,
        zone: card.zone,
        sourceSlot: null,
        count: card.count,
      }));
      const resolved = await canonicalPrintings.cardIdsByNames(
        decoded.cards.map((card) => card.cardName),
      );
      resolvedMap = new Map(resolved.map((row) => [row.cardName.toLowerCase(), row]));

      // Tag+name fallback for unresolved entries (e.g. "Sett, The Boss" → tag "Sett" + name "The Boss")
      const unresolvedNames = decoded.cards
        .filter((card) => !resolvedMap.has(card.cardName.toLowerCase()))
        .map((card) => card.cardName);
      if (unresolvedNames.length > 0) {
        const tagResolved = await canonicalPrintings.cardIdsByTagAndName(unresolvedNames);
        for (const row of tagResolved) {
          resolvedMap.set(row.originalName.toLowerCase(), row);
        }
      }
    } else {
      let decoded;
      try {
        decoded = format === "tts" ? decodeTTS(body.code) : piltoverCodec.decode(body.code);
      } catch {
        throw new AppError(400, ERROR_CODES.INVALID_DECK_CODE, "Invalid or unsupported deck code");
      }
      decodedWarnings = decoded.warnings;
      entries = decoded.cards.map((card) => ({
        lookupKey: card.cardCode,
        label: card.cardCode,
        zone: null,
        sourceSlot: card.sourceSlot,
        count: card.count,
      }));
      const resolved = await canonicalPrintings.cardIdsByShortCodes(
        decoded.cards.map((card) => card.cardCode),
      );
      resolvedMap = new Map(resolved.map((row) => [row.shortCode, row]));
    }

    const warnings = [...decodedWarnings];
    const cards: DeckImportPreviewResponse["cards"] = [];

    for (const entry of entries) {
      const card = resolvedMap.get(entry.lookupKey);
      if (!card) {
        warnings.push(`Unknown card: ${entry.label} (skipped)`);
        continue;
      }

      cards.push({
        cardId: card.cardId,
        shortCode: card.shortCode,
        zone:
          entry.zone ?? inferZone(card.cardType, card.superTypes, entry.sourceSlot ?? "mainDeck"),
        quantity: entry.count,
        cardName: card.cardName,
        cardType: card.cardType,
        superTypes: card.superTypes,
        domains: card.domains,
        preferredPrintingId: formatCarriesPrinting ? card.printingId : null,
      });
    }

    return c.json({ cards, warnings } satisfies DeckImportPreviewResponse);
  })

  // ── PATCH /decks/:id/pin ──────────────────────────────────────────────────
  .openapi(setDeckPinned, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { isPinned } = c.req.valid("json");

    const updated = await decks.setPinned(id, userId, isPinned);
    assertFound(updated, "Not found");

    return c.json(toDeck(updated));
  })

  // ── PATCH /decks/:id/archive ──────────────────────────────────────────────
  .openapi(setDeckArchived, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { archived } = c.req.valid("json");

    const updated = await decks.setArchived(id, userId, archived);
    assertFound(updated, "Not found");

    return c.json(toDeck(updated));
  })

  // ── POST /decks/:id/share ─────────────────────────────────────────────────
  // Generates (or rotates) the deck's share token and flips is_public=true.
  .openapi(shareDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const token = generateShareToken();
    const updated = await decks.setShareToken(id, userId, token, true);
    assertFound(updated, "Not found");

    return c.json({ shareToken: token, isPublic: true });
  })

  // ── DELETE /decks/:id/share ───────────────────────────────────────────────
  // Nulls the share token and flips is_public=false. Old links 404 forever.
  .openapi(unshareDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const updated = await decks.setShareToken(id, userId, null, false);
    assertFound(updated, "Not found");

    return c.body(null, 204);
  })

  // ── POST /decks/share/:token/clone ────────────────────────────────────────
  // Any logged-in user can clone a publicly shared deck into their account.
  .openapi(cloneSharedDeck, async (c) => {
    const { decks } = c.get("repos");
    const userId = getUserId(c);
    const { token } = c.req.valid("param");

    const newDeck = await decks.cloneFromShareToken(token, userId);
    assertFound(newDeck, "Not found");

    return c.json({ deckId: newDeck.id }, 201);
  });
