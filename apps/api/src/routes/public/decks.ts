import type {
  DeckExportResponse,
  DeckPlanCardMetaResponse,
  PublicDeckDetailResponse,
} from "@openrift/shared";
import { isBaseBanFormat } from "@openrift/shared";
import { publicDecksContract } from "@openrift/shared/contracts/public-decks";
import { implement } from "@orpc/server";

import {
  isEmptyDeckPlan,
  toDeckPlan,
  toPublicDeck,
  toPublicDeckCard,
} from "../../lib/deck-presenters.js";
import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { encodeDeck } from "../../services/deck-codecs/encode-deck.js";

const os = implement(publicDecksContract).$context<ApiContext>().use(requireUser);

/**
 * Public shared-deck view. An unknown token returns a typed NOT_FOUND. Card +
 * preferred-printing data is denormalized so the share page can SSR without
 * the global catalog.
 */
export const publicDecksRouter = {
  share: os.share.handler(async ({ input, context, errors }): Promise<PublicDeckDetailResponse> => {
    const { decks, deckPlans, catalog, canonicalPrintings, customTags } = context.repos;

    const found = await decks.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Not found" });
    }

    const cards = await decks.cardsForDeck(found.deck.id, found.deck.userId);
    const planData = await deckPlans.getForDeck(found.deck.id);
    const plan = toDeckPlan(planData);

    const uniqueCardIds = [...new Set(cards.map((card) => card.cardId))];
    const [cardMetas, printingMetas, customTagAssignmentsMap, banRows] = await Promise.all([
      catalog.cardsByIds(uniqueCardIds),
      canonicalPrintings.resolvePrintingMetaForRows(
        cards.map((card) => ({
          cardId: card.cardId,
          preferredPrintingId: card.preferredPrintingId,
        })),
      ),
      customTags.assignmentsForCardIds(uniqueCardIds),
      catalog.cardBansByCardIds(uniqueCardIds),
    ]);
    const cardMetaById = new Map(cardMetas.map((meta) => [meta.id, meta]));
    // Only base-list bans invalidate a deck; mode-scoped ones (e.g. 2v2) stay
    // a display concern, so they never reach the share payload.
    const bannedCardIds = new Set(
      banRows.filter((ban) => isBaseBanFormat(ban.formatId)).map((ban) => ban.cardId),
    );

    // The plan references cards the deck may not contain (notably the opponent
    // identity card), so denormalize their display meta separately.
    const visiblePlan = isEmptyDeckPlan(plan) ? null : plan;
    const planCardIds = visiblePlan
      ? [
          ...new Set(
            [
              ...visiblePlan.matchups.map((matchup) => matchup.opponentCardId),
              ...visiblePlan.matchups.flatMap((matchup) =>
                matchup.swaps.map((swap) => swap.cardId),
              ),
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
          cardTypes: meta.types,
          imageId: planPrintingMetas[index]?.imageId ?? null,
        };
      });
    }

    return {
      deck: toPublicDeck(found.deck),
      cards: cards.map((row, index) => {
        const cardMeta = cardMetaById.get(row.cardId);
        const printingMeta = printingMetas[index];
        if (!cardMeta || !printingMeta) {
          // FK constraint guarantees the card exists; printingMetas is built
          // in input order. Either being missing means an invariant broke.
          throw new Error(`Missing enrichment for deck card ${row.cardId}`);
        }
        return toPublicDeckCard(row, cardMeta, printingMeta, bannedCardIds.has(row.cardId));
      }),
      owner: {
        displayName: found.ownerName ?? "Anonymous",
        gravatarHash: gravatarHashForEmail(found.ownerEmail),
      },
      plan: visiblePlan,
      planCardMeta,
      customTagAssignments: Object.fromEntries(customTagAssignmentsMap),
    };
  }),

  encode: os.encode.handler(({ input, context }): Promise<DeckExportResponse> => {
    const { canonicalPrintings } = context.repos;
    return encodeDeck(canonicalPrintings, input.cards, input.format ?? "piltover");
  }),
};
