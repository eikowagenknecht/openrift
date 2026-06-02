import { createRoute } from "@hono/zod-openapi";
import type {
  CardType,
  DeckAvailabilityItemResponse,
  DeckAvailabilityResponse,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormatConfig,
  DeckListItemResponse,
  DeckListResponse,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import { WellKnown, validateDeck } from "@openrift/shared";
import {
  deckAvailabilityResponseSchema,
  deckCardsResponseSchema,
  deckCloneResponseSchema,
  deckDetailResponseSchema,
  deckExportResponseSchema,
  deckListResponseSchema,
  deckResponseSchema,
  deckShareResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  createDeckSchema,
  deckExportQuerySchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";
import { z } from "zod";

import type { Repos } from "../../deps.js";
import { AppError, ERROR_CODES } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { DeckUpdateInput } from "../../repositories/decks.js";
import { encodeText, encodeTTS, piltoverCodec } from "../../services/deck-codecs/index.js";
import type { TextCodecCard } from "../../services/deck-codecs/index.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toDeck, toDeckAvailabilityItem, toDeckCard, toDeckSummary } from "../../utils/mappers.js";
import { generateShareToken } from "../../utils/share-token.js";

async function assertKnownFormat(deckFormats: Repos["deckFormats"], format: string): Promise<void> {
  const row = await deckFormats.getBySlug(format);
  if (!row) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown deck format: ${format}`);
  }
}

/**
 * Per-format validation of `formatConfig`. Each format declares its own
 * shape; this helper dispatches by slug and rejects malformed values at the
 * API boundary so the DB never holds a config the runtime can't honor.
 *
 * Custom-Region accepts `null` (no regions picked yet) or
 * `{ tagSlugs: <slug>[] }` where each slug references an existing
 * custom_tags row with category='region'. At least one slug is required;
 * duplicates are deduped to keep the persisted payload tidy.
 *
 * @returns The normalized config to persist, or null when the user hasn't
 *   provided one yet. Throws AppError(400) for malformed values.
 */
async function validateFormatConfig(
  customTagsRepo: Repos["customTags"],
  format: string,
  config: Record<string, unknown> | null | undefined,
): Promise<DeckFormatConfig | null> {
  if (config === undefined || config === null) {
    return null;
  }

  if (format === WellKnown.deckFormat.CUSTOM_REGION) {
    const raw = config.tagSlugs;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "formatConfig.tagSlugs must be a non-empty array for Custom - Region decks",
      );
    }
    const slugs = [
      ...new Set(raw.filter((slug): slug is string => typeof slug === "string" && slug !== "")),
    ];
    if (slugs.length !== raw.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "formatConfig.tagSlugs must contain unique non-empty strings",
      );
    }
    const tags = await customTagsRepo.listBySlugs(slugs);
    const tagBySlug = new Map(tags.map((tag) => [tag.slug, tag]));
    for (const slug of slugs) {
      const tag = tagBySlug.get(slug);
      if (!tag) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown custom tag slug: ${slug}`);
      }
      if (tag.category !== "region") {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          `Custom tag "${slug}" is not in the region category`,
        );
      }
    }
    return { tagSlugs: slugs };
  }

  // Other formats don't accept config today; reject anything non-null so we
  // don't silently persist data that has no consumer.
  throw new AppError(
    400,
    ERROR_CODES.BAD_REQUEST,
    `Format "${format}" does not accept format_config`,
  );
}

const patchFields: FieldMapping<DeckUpdateInput> = {
  name: "name",
  description: "description",
  format: "format",
  formatConfig: "formatConfig",
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

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

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

const decksApp = createApiApp().basePath("/decks");
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
    const excludedTypes = new Set<string>([
      WellKnown.cardType.LEGEND,
      WellKnown.cardType.RUNE,
      WellKnown.cardType.BATTLEFIELD,
    ]);
    const countedZones = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

    const items: DeckListItemResponse[] = deckRows.map((row) => {
      const cards = cardsByDeckId.get(row.id) ?? [];
      const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
      const champion = cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);

      // Total cards (excluding overflow)
      const totalCards = cards
        .filter((card) => card.zone !== WellKnown.deckZone.OVERFLOW)
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

      // Validation. The list endpoint cares only about pass/fail, not the
      // detailed violations, so we deliberately don't load per-card custom
      // tag assignments here — the tag-membership rule would mis-report when
      // the list query skipped the join. Custom-Region decks therefore show
      // as valid in the list and surface real violations on the deck page.
      const isValid =
        row.format === WellKnown.deckFormat.CONSTRUCTED
          ? validateDeck({
              format: WellKnown.deckFormat.CONSTRUCTED,
              cards: cards.map((card) => ({
                cardId: card.cardId,
                zone: card.zone as DeckZone,
                quantity: card.quantity,
                cardName: card.cardName,
                cardType: card.cardType as CardType,
                superTypes: card.superTypes as SuperType[],
                domains: card.domains as Domain[],
                tags: card.tags,
                customTagSlugs: [],
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
    const { decks, deckFormats, customTags } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await assertKnownFormat(deckFormats, body.format);
    const formatConfig = await validateFormatConfig(customTags, body.format, body.formatConfig);
    const row = await decks.create({
      userId,
      name: body.name,
      description: body.description ?? null,
      format: body.format,
      formatConfig,
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
    const { decks, deckFormats, customTags } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    if (body.format !== undefined) {
      await assertKnownFormat(deckFormats, body.format);
    }
    // Decide which format the resulting deck will be under, so format_config
    // is validated against the right shape — body.format wins, falling back
    // to the deck's current format when only the config is being patched.
    let effectiveFormat = body.format;
    if (effectiveFormat === undefined && body.formatConfig !== undefined) {
      const current = await decks.getIdAndFormat(id, userId);
      assertFound(current, "Not found");
      effectiveFormat = current.format;
    }
    // Resolve formatConfig BEFORE buildPatchUpdates so it counts as a field
    // change. Two paths land here with an implicit config update:
    //   1. body has formatConfig: validate against the resulting format.
    //   2. format is changing but body doesn't specify config: clear the
    //      old config so a Custom-Region deck switched to constructed
    //      doesn't keep a stale tagSlugs, and a deck switched INTO
    //      Custom-Region lands in the "pick a region" banner state.
    const normalized: Record<string, unknown> = { ...body };
    if (body.formatConfig !== undefined && effectiveFormat !== undefined) {
      normalized.formatConfig = await validateFormatConfig(
        customTags,
        effectiveFormat,
        body.formatConfig,
      );
    } else if (body.format !== undefined && body.formatConfig === undefined) {
      normalized.formatConfig = null;
    }
    const updates = buildPatchUpdates<DeckUpdateInput>(normalized, patchFields);
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
