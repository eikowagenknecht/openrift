import { createRoute } from "@hono/zod-openapi";
import type { DeckPlanCardMetaResponse, PublicDeckDetailResponse } from "@openrift/shared";
import { publicDeckDetailResponseSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import { assertFound } from "../../utils/assertions.js";
import {
  isEmptyDeckPlan,
  toDeckPlan,
  toPublicDeck,
  toPublicDeckCard,
} from "../../utils/mappers.js";

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
    ...errorResponses(404),
  },
});

/** Public: GET /decks/share/{token} — anonymous view of a shared deck. 404 if the token does not match a public deck. */
export const publicDecksRoute = createApiApp().openapi(getPublicDeckByShareToken, async (c) => {
  const { decks, deckPlans, catalog, canonicalPrintings, customTags } = c.get("repos");
  const { token } = c.req.valid("param");

  const found = await decks.findByShareToken(token);
  assertFound(found, "Not found");

  const cards = await decks.cardsForDeck(found.deck.id, found.deck.userId);
  const planData = await deckPlans.getForDeck(found.deck.id);
  const plan = toDeckPlan(planData);

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

  // The plan references cards the deck may not contain (notably the opponent
  // Legend), so denormalize their display meta separately for anon viewers.
  const visiblePlan = isEmptyDeckPlan(plan) ? null : plan;
  const planCardIds = visiblePlan
    ? [
        ...new Set(
          [
            ...visiblePlan.matchups.map((matchup) => matchup.opponentLegendCardId),
            ...visiblePlan.matchups.flatMap((matchup) => matchup.swaps.map((swap) => swap.cardId)),
            visiblePlan.battlefieldGame1CardId,
            visiblePlan.battlefieldFirstCardId,
            visiblePlan.battlefieldSecondCardId,
          ].filter((id): id is string => id !== null),
        ),
      ]
    : [];
  let planCardMeta: DeckPlanCardMetaResponse[] = [];
  if (planCardIds.length > 0) {
    const [planMetas, planPrintingMetas] = await Promise.all([
      catalog.cardsByIds(planCardIds),
      canonicalPrintings.resolvePrintingMetaForRows(
        planCardIds.map((cardId) => ({ cardId, preferredPrintingId: null })),
      ),
    ]);
    const planMetaById = new Map(planMetas.map((meta) => [meta.id, meta]));
    planCardMeta = planCardIds.map((cardId, index) => {
      const meta = planMetaById.get(cardId);
      if (!meta) {
        throw new Error(`Missing enrichment for plan card ${cardId}`);
      }
      return {
        cardId,
        cardName: meta.name,
        cardSlug: meta.slug,
        cardType: meta.type,
        imageId: planPrintingMetas[index]?.imageId ?? null,
      };
    });
  }

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
    owner: {
      displayName: found.ownerName ?? "Anonymous",
      gravatarHash: gravatarHashForEmail(found.ownerEmail),
    },
    plan: visiblePlan,
    planCardMeta,
    customTagAssignments: Object.fromEntries(customTagAssignmentsMap),
  };

  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return c.json(response, 200);
});
