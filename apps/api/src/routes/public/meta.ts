import type {
  MetaDeckCardIndexResponse,
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaActivityResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
  MetaCountsResponse,
  MetaLegendDetailResponse,
  MetaLegendListResponse,
  MetaPlayerDetailResponse,
} from "@openrift/shared";
import { metaContract } from "@openrift/shared/contracts/meta";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import {
  archiveLegendSlug,
  toMetaDeckCardIndex,
  toMetaDeckContext,
  toMetaDeckSummary,
  toMetaEventDetail,
  toMetaEventMatch,
  toMetaEventPhase,
  toMetaEventPlayer,
  toMetaEventSummary,
  toMetaActivityItem,
  toMetaEventFinish,
  toMetaLegendFinish,
  toMetaLegendRef,
  toMetaLegendSummary,
  toMetaPlayerFinish,
} from "../../lib/meta-presenters.js";
import { buildPublicDeckDetail } from "../../lib/public-deck-payload.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(metaContract).$context<ApiContext>().use(requireUser);

const ACTIVITY_LIMIT = 6;

const BEST_FINISH_COUNT = 5;

const FINISH_PAGE_SIZE = 25;

/**
 * Resolves each card's canonical image in one batch (`preferredPrintingId: null`
 * asks for the card's default, not a particular printing).
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

function referencedCardIds(
  rows: readonly { legendCardId: string | null; championCardId: string | null }[],
): string[] {
  return rows.flatMap((row) =>
    [row.legendCardId, row.championCardId].filter((id): id is string => id !== null),
  );
}

/** Public meta archive, mounted under `/api/v1/meta`. Every route is anonymous and SSR-facing. */
export const metaRouter = {
  events: os.events.handler(async ({ input, context }): Promise<MetaEventListResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const rows = await meta.allEvents(input);
    const finishes = await meta.topFinishesForEvents(rows.map((row) => row.id));
    const images = await imageIdsForCards(
      canonicalPrintings,
      finishes.map((finish) => finish.legendCardId).filter((id) => id !== null),
    );
    const byEvent = Map.groupBy(finishes, (finish) => finish.metaEventId);

    return {
      events: rows.map((row) =>
        toMetaEventSummary(
          row,
          (byEvent.get(row.id) ?? []).map((finish) => toMetaEventFinish(finish, images)),
        ),
      ),
    };
  }),

  activity: os.activity.handler(async ({ context }): Promise<MetaActivityResponse> => {
    const items = await context.repos.meta.recentActivity(ACTIVITY_LIMIT);
    return { items: items.map((row) => toMetaActivityItem(row)) };
  }),

  event: os.event.handler(async ({ input, context, errors }): Promise<MetaEventDetailResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const event = await meta.eventBySlug(input.slug);
    if (!event) {
      throw errors.NOT_FOUND({ message: "Event not found" });
    }

    const [players, matches, phases, sources, contributors] = await Promise.all([
      meta.standingsForEvent(event.id),
      meta.matchesForEvent(event.id),
      meta.phasesForEvent(event.id),
      meta.sourcesForEvent(event.id),
      meta.contributorsForEvent(event.id),
    ]);
    const images = await imageIdsForCards(canonicalPrintings, referencedCardIds(players));
    const topFinishes = players
      .filter((player) => player.rank <= 3)
      .map((player) => toMetaEventFinish(player, images));

    return {
      event: toMetaEventDetail(event, { sources, contributors, topFinishes }),
      players: players.map((row) => toMetaEventPlayer(row, images)),
      matches: matches.map((row) => toMetaEventMatch(row)),
      phases: phases.map((row) => toMetaEventPhase(row)),
    };
  }),

  decks: os.decks.handler(async ({ input, context }): Promise<MetaDeckListResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const { rows, total } = await meta.allDeckSummaries(input);
    const images = await imageIdsForCards(canonicalPrintings, referencedCardIds(rows));

    return { decks: rows.map((row) => toMetaDeckSummary(row, images)), total };
  }),

  deckCards: os.deckCards.handler(
    async ({ input, context }): Promise<MetaDeckCardIndexResponse> => {
      const { meta } = context.repos;
      return toMetaDeckCardIndex(await meta.allDeckCards(input));
    },
  ),

  deck: os.deck.handler(async ({ input, context, errors }): Promise<MetaDeckDetailResponse> => {
    const { decks, meta } = context.repos;

    const found = await decks.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    const metaContext = await meta.contextForDeck(found.deck.id);
    if (!metaContext) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    const [payload, contributors] = await Promise.all([
      buildPublicDeckDetail(context.repos, found),
      meta.contributorsForPlayer(metaContext.playerId),
    ]);
    return { ...payload, meta: toMetaDeckContext(metaContext, contributors) };
  }),

  legends: os.legends.handler(async ({ context }): Promise<MetaLegendListResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const [rows, records] = await Promise.all([
      meta.archiveLegends(),
      meta.archiveLegendEventRecords(),
    ]);
    const images = await imageIdsForCards(
      canonicalPrintings,
      rows.map((row) => row.cardId),
    );
    const recordsByLegend = Map.groupBy(records, (record) => record.legendCardId);

    return {
      legends: rows
        .map((row) => toMetaLegendSummary(row, images, recordsByLegend.get(row.cardId) ?? []))
        // Sorted by display name; the repo orders by stored epithet (files Azir under E).
        .toSorted((a, b) => a.legend.name.localeCompare(b.legend.name)),
    };
  }),

  legend: os.legend.handler(
    async ({ input, context, errors }): Promise<MetaLegendDetailResponse> => {
      const { meta, canonicalPrintings } = context.repos;

      // The route key is composed from the card's champion tag and slug, so it
      // can't be looked up by a column; the archive holds only a few dozen legends.
      const legends = await meta.archiveLegends();
      const row = legends.find((candidate) => archiveLegendSlug(candidate) === input.slug);
      if (!row) {
        throw errors.NOT_FOUND({ message: "Legend not found" });
      }

      const page = input.page ?? 1;
      const [finishes, best, counts, images] = await Promise.all([
        meta.finishesForLegend(row.cardId, input, {
          limit: FINISH_PAGE_SIZE,
          offset: (page - 1) * FINISH_PAGE_SIZE,
        }),
        meta.bestFinishesForLegend(row.cardId, input, BEST_FINISH_COUNT),
        meta.legendRecordCounts(row.cardId, input),
        imageIdsForCards(canonicalPrintings, [row.cardId]),
      ]);
      const ref = toMetaLegendRef(row, images);

      return {
        slug: ref.slug,
        legend: ref.legend,
        counts,
        best: best.map((finish) => toMetaLegendFinish(finish)),
        finishes: finishes.rows.map((finish) => toMetaLegendFinish(finish)),
        total: finishes.total,
        page,
      };
    },
  ),

  player: os.player.handler(
    async ({ input, context, errors }): Promise<MetaPlayerDetailResponse> => {
      const { meta, canonicalPrintings } = context.repos;

      const finishes = await meta.finishesForPlayer(input.key);
      const newest = finishes[0];
      if (newest === undefined) {
        throw errors.NOT_FOUND({ message: "Player not found" });
      }
      const images = await imageIdsForCards(
        canonicalPrintings,
        finishes.map((finish) => finish.legendCardId).filter((id) => id !== null),
      );

      return {
        key: input.key,
        name: newest.playerName,
        finishes: finishes.map((finish) => toMetaPlayerFinish(finish, images)),
      };
    },
  ),

  counts: os.counts.handler(async ({ input, context }): Promise<MetaCountsResponse> => {
    const { meta } = context.repos;
    const [totalPlayers, decksWithMainDeck, eventsByTier] = await Promise.all([
      meta.playerCountInScope(input),
      meta.deckCountInScope(input),
      meta.eventTierCounts(),
    ]);
    const totalEvents = Object.values(eventsByTier).reduce((sum, count) => sum + count, 0);
    return { totalPlayers, decksWithMainDeck, totalEvents, eventsByTier };
  }),
};
