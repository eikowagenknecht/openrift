import type { DeckPlanCardMetaResponse, PublicDeckDetailResponse } from "@openrift/shared";
import { isBaseBanFormat } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { DecksTable } from "../db/index.js";
import type { Repos } from "../deps.js";
import { isEmptyDeckPlan, toDeckPlan, toPublicDeck, toPublicDeckCard } from "./deck-presenters.js";
import { gravatarHashForEmail } from "./gravatar.js";

/** What `decksRepo.findByShareToken` hands back: the deck plus its owner's display fields. */
export interface SharedDeckRow {
  deck: Selectable<DecksTable>;
  ownerName: string | null;
  ownerEmail: string;
}

/**
 * Builds the anonymous share-deck payload for an already-resolved deck.
 *
 * Everything the share page needs is denormalized here — card names, types,
 * domains, resolved printings, artwork, base-list bans, and the plan's
 * out-of-deck card references — so the page SSRs without pulling the global
 * catalog.
 *
 * Split out of the `/decks/share/{token}` handler because the meta archive's
 * deck page returns the same payload plus an event panel (ADR-014); the token
 * lookup and the archive-membership check stay with the callers, since only
 * they know which decks they are allowed to resolve.
 *
 * @param repos The request's repositories.
 * @param found The deck row and owner fields from `decks.findByShareToken`.
 * @returns The full public deck-detail payload.
 */
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
  };
}
