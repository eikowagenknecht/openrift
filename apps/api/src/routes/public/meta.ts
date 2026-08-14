import { WellKnown } from "@openrift/shared";
import type {
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
  MetaStatsResponse,
} from "@openrift/shared";
import { metaContract } from "@openrift/shared/contracts/meta";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import {
  toMetaDeckContext,
  toMetaDeckSummary,
  toMetaEventDetail,
  toMetaEventSummary,
  toMetaStatRow,
} from "../../lib/meta-presenters.js";
import { buildPublicDeckDetail } from "../../lib/public-deck-payload.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { MetaDeckSummaryRow } from "../../repositories/meta.js";

const os = implement(metaContract).$context<ApiContext>().use(requireUser);

/**
 * Resolves the canonical front image of each card in one batch, so a deck list
 * or a stats table costs one printing lookup rather than one per row. Passing
 * `preferredPrintingId: null` is what asks for the card's canonical default —
 * these surfaces show the card, not a particular printing of it.
 *
 * @param canonicalPrintings The canonical-printings repo.
 * @param cardIds Card ids to resolve; duplicates and nulls are the caller's to avoid.
 * @returns Image id per card id, `null` where the card has no usable artwork.
 */
async function imageIdsForCards(
  canonicalPrintings: Repos["canonicalPrintings"],
  cardIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(cardIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const metas = await canonicalPrintings.resolvePrintingMetaForRows(
    unique.map((cardId) => ({ cardId, preferredPrintingId: null })),
  );
  return new Map(unique.map((cardId, index) => [cardId, metas[index]?.imageId ?? null]));
}

/**
 * Collects the legend and champion card ids across a batch of deck summaries.
 * @param rows Deck summary rows.
 * @returns Every non-null card id the rows reference.
 */
function summaryCardIds(rows: MetaDeckSummaryRow[]): string[] {
  return rows.flatMap((row) =>
    [row.legendCardId, row.championCardId].filter((id): id is string => id !== null),
  );
}

/**
 * Public meta archive (ADR-014), mounted under `/api/v1/meta`. Every route is
 * anonymous and SSR-facing.
 *
 * The deck read resolves the share token first and then checks archive
 * membership, so a regular user's shared deck 404s here instead of rendering
 * as an archive entry under someone else's byline.
 */
export const metaRouter = {
  events: os.events.handler(async ({ context }): Promise<MetaEventListResponse> => {
    const rows = await context.repos.meta.listEvents();
    return { events: rows.map((row) => toMetaEventSummary(row)) };
  }),

  event: os.event.handler(async ({ input, context, errors }): Promise<MetaEventDetailResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const event = await meta.eventBySlug(input.slug);
    if (!event) {
      throw errors.NOT_FOUND({ message: "Event not found" });
    }

    const deckRows = await meta.deckSummariesForEvent(event.id);
    const images = await imageIdsForCards(canonicalPrintings, summaryCardIds(deckRows));

    return {
      event: toMetaEventDetail(event),
      decks: deckRows.map((row) => toMetaDeckSummary(row, images)),
    };
  }),

  decks: os.decks.handler(async ({ context }): Promise<MetaDeckListResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const deckRows = await meta.allDeckSummaries();
    const images = await imageIdsForCards(canonicalPrintings, summaryCardIds(deckRows));

    return { decks: deckRows.map((row) => toMetaDeckSummary(row, images)) };
  }),

  deck: os.deck.handler(async ({ input, context, errors }): Promise<MetaDeckDetailResponse> => {
    const { decks, meta } = context.repos;

    const found = await decks.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    // Membership check, not decoration: without it this endpoint would render
    // any shared user deck as an archive entry.
    const metaContext = await meta.contextForDeck(found.deck.id);
    if (!metaContext) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    // An archetype is never minted a token, so no request should get this far
    // with one. Refusing anyway keeps the "no page without a main deck" rule
    // true for a token added by hand, and for a deck demoted back to
    // "archetype" after it had one. A partial list renders normally: its main
    // deck is there, only some side zones are missing.
    if (metaContext.listStatus === "archetype") {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    const payload = await buildPublicDeckDetail(context.repos, found);
    return { ...payload, meta: toMetaDeckContext(metaContext) };
  }),

  stats: os.stats.handler(async ({ input, context }): Promise<MetaStatsResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const [totalDecks, decksWithMainDeck, cards, legends] = await Promise.all([
      meta.deckCountInScope(input),
      meta.deckCountInScope(input, { knownMainDeckOnly: true }),
      // Main deck only: counting every zone puts each deck's battlefields and
      // runes at the top of the list, which says nothing about the meta.
      //
      // Which is also why a partial list counts here in full — its main deck is
      // complete, and the main deck is all this reads. Only archetypes drop
      // out, and they are counted in the legend play-rate below instead: their
      // legend is real data, their card list is not a list at all. Hence the
      // second denominator.
      meta.cardInclusion(input, { zone: WellKnown.deckZone.MAIN, knownMainDeckOnly: true }),
      meta.cardInclusion(input, { zone: WellKnown.deckZone.LEGEND }),
    ]);

    // The two aggregates read disjoint zones, so both sets of card ids go into
    // the one lookup.
    const images = await imageIdsForCards(canonicalPrintings, [
      ...cards.map((row) => row.cardId),
      ...legends.map((row) => row.cardId),
    ]);

    return {
      totalDecks,
      decksWithMainDeck,
      cards: cards.map((row) => toMetaStatRow(row, images)),
      legends: legends.map((row) => toMetaStatRow(row, images)),
    };
  }),
};
