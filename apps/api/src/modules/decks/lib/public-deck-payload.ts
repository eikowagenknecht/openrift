import type {
  DeckCatalogSubset,
  DeckPlanCardMetaResponse,
  PublicDeckDetailResponse,
} from "@openrift/shared/types/api/deck";
import { isBaseBanFormat } from "@openrift/shared/well-known";
import type { Selectable } from "kysely";

import type { DecksTable } from "../../../db/tables/decks.js";
import type { Repos } from "../../../deps.js";
import { gravatarHashForEmail } from "../../../lib/gravatar.js";
import {
  buildCardsResponse,
  buildPrintingsResponse,
  loadPrintingDecorations,
} from "../../catalog/lib/printing-presenters.js";
import { isEmptyDeckPlan, toDeckPlan, toPublicDeck, toPublicDeckCard } from "./deck-presenters.js";

async function catalogSubsetForCards(
  repos: Repos,
  cardIds: readonly string[],
): Promise<DeckCatalogSubset> {
  const ids = [...cardIds];
  const [sets, cardRows, printingRows, imageRows, banRows, errataRows] = await Promise.all([
    repos.catalog.sets(),
    repos.catalog.cardsByIds(ids),
    repos.catalog.printingsByCardIds(ids),
    repos.catalog.printingImagesByCardIds(ids),
    repos.catalog.cardBansByCardIds(ids),
    repos.catalog.cardErrataByCardIds(ids),
  ]);
  const decorations = await loadPrintingDecorations(
    repos,
    printingRows.map((row) => row.id),
  );
  return {
    sets,
    cards: buildCardsResponse(cardRows, banRows, errataRows),
    printings: buildPrintingsResponse(printingRows, imageRows, decorations),
  };
}

/** What `decksRepo.findByShareToken` hands back: the deck plus its owner's display fields. */
export interface SharedDeckRow {
  deck: Selectable<DecksTable>;
  ownerName: string | null;
  ownerEmail: string;
}

/** Caller must already have resolved the token and checked archive membership. */
export async function buildPublicDeckDetail(
  repos: Repos,
  found: SharedDeckRow,
): Promise<PublicDeckDetailResponse> {
  const { decks, deckPlans, catalog, canonicalPrintings, customTags } = repos;

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
  const catalogSubset = await catalogSubsetForCards(repos, [
    ...new Set([...uniqueCardIds, ...cardMetas.flatMap((meta) => meta.tokenCardIds)]),
  ]);
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
    catalog: catalogSubset,
  };
}
