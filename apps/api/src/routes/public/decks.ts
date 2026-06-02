import { createRoute } from "@hono/zod-openapi";
import type { PublicDeckDetailResponse } from "@openrift/shared";
import { publicDeckDetailResponseSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import { createApiApp } from "../../openapi.js";
import { assertFound } from "../../utils/assertions.js";
import { toPublicDeck, toPublicDeckCard } from "../../utils/mappers.js";

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const getPublicDeckByShareToken = createRoute({
  method: "get",
  path: "/decks/share/{token}",
  tags: ["Decks"],
  request: { params: shareTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicDeckDetailResponseSchema } },
      description: "Shared deck",
    },
  },
});

/** Public: GET /decks/share/{token} — anonymous view of a shared deck. 404 if the token does not match a public deck. */
export const publicDecksRoute = createApiApp().openapi(getPublicDeckByShareToken, async (c) => {
  const { decks, catalog, canonicalPrintings, customTags } = c.get("repos");
  const { token } = c.req.valid("param");

  const found = await decks.findByShareToken(token);
  assertFound(found, "Not found");

  const cards = await decks.cardsForDeck(found.deck.id, found.deck.userId);

  // Denormalize card + preferred-printing data so the share page can SSR
  // without the global catalog. All three lookups only need the distinct
  // IDs actually referenced by this deck — custom-tag assignments are
  // scoped here so anon viewers of a Custom-Region deck can validate it.
  const uniqueCardIds = [...new Set(cards.map((card) => card.cardId))];
  const [cardMetas, printingMetas, customTagAssignmentsMap] = await Promise.all([
    catalog.cardsByIds(uniqueCardIds),
    canonicalPrintings.resolvePrintingMetaForRows(
      cards.map((card) => ({
        cardId: card.cardId,
        preferredPrintingId: card.preferredPrintingId,
      })),
    ),
    customTags.assignmentsForCardIds(uniqueCardIds),
  ]);
  const cardMetaById = new Map(cardMetas.map((meta) => [meta.id, meta]));

  const response: PublicDeckDetailResponse = {
    deck: toPublicDeck(found.deck),
    cards: cards.map((row, index) => {
      const cardMeta = cardMetaById.get(row.cardId);
      const printingMeta = printingMetas[index];
      if (!cardMeta || !printingMeta) {
        // FK constraint guarantees the card exists; printingMetas is built
        // in input order. Either being missing means an invariant broke.
        throw new Error(`Missing enrichment for deck card ${row.cardId}`);
      }
      return toPublicDeckCard(row, cardMeta, printingMeta);
    }),
    owner: { displayName: found.ownerName ?? "Anonymous" },
    customTagAssignments: Object.fromEntries(customTagAssignmentsMap),
  };

  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return c.json(response);
});
