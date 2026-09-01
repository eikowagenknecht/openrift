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
} from "../../lib/meta-presenters.js";
import { buildPublicDeckDetail } from "../../lib/public-deck-payload.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(metaContract).$context<ApiContext>().use(requireUser);

/** Bursts on the front page's "Fresh in the archive" list. */
const ACTIVITY_LIMIT = 6;

/**
 * Resolves the canonical front image of each card in one batch, so a standings
 * table or a deck list costs one printing lookup rather than one per row.
 * Passing `preferredPrintingId: null` is what asks for the card's canonical
 * default — these surfaces show the card, not a particular printing of it.
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
 * Collects the legend and champion card ids across a batch of rows.
 * @param rows Rows carrying a legend and a champion card id.
 * @returns Every non-null card id the rows reference.
 */
function referencedCardIds(
  rows: readonly { legendCardId: string | null; championCardId: string | null }[],
): string[] {
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
    const { meta, canonicalPrintings } = context.repos;

    const rows = await meta.allEvents();
    const finishes = await meta.topFinishesForEvents(rows.map((row) => row.id));
    // Legends only: a list row shows a finish's legend, never their champion.
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
      // Already filtered by the repo: anyone on `hidden`, and anyone whose
      // chosen profile field is blank, never reaches this payload.
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

  decks: os.decks.handler(async ({ context }): Promise<MetaDeckListResponse> => {
    const { meta, canonicalPrintings } = context.repos;

    const deckRows = await meta.allDeckSummaries();
    const images = await imageIdsForCards(canonicalPrintings, referencedCardIds(deckRows));

    return { decks: deckRows.map((row) => toMetaDeckSummary(row, images)) };
  }),

  deckCards: os.deckCards.handler(async ({ context }): Promise<MetaDeckCardIndexResponse> => {
    const { meta } = context.repos;
    return toMetaDeckCardIndex(await meta.allDeckCards());
  }),

  deck: os.deck.handler(async ({ input, context, errors }): Promise<MetaDeckDetailResponse> => {
    const { decks, meta } = context.repos;

    const found = await decks.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    // Membership check, not decoration: without it this endpoint would render
    // any shared user deck as an archive entry. A standings-only entry has no
    // deck at all, so it can never resolve here.
    const metaContext = await meta.contextForDeck(found.deck.id);
    if (!metaContext) {
      throw errors.NOT_FOUND({ message: "Deck not found" });
    }

    const [payload, contributors] = await Promise.all([
      buildPublicDeckDetail(context.repos, found),
      // The entry's own credit line: whoever contributed this list, not everyone
      // who fed its event. Already filtered by the repo, as on the event page.
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
        // By the name a reader sees, so a legend files under its champion. The
        // repo orders by the stored epithet, which would file Azir under E.
        .toSorted((a, b) => a.legend.name.localeCompare(b.legend.name)),
    };
  }),

  legend: os.legend.handler(
    async ({ input, context, errors }): Promise<MetaLegendDetailResponse> => {
      const { meta, canonicalPrintings } = context.repos;

      // The route key is composed from the card's champion tag and its slug, so
      // it cannot be looked up by a column. The archive holds one row per legend
      // and a few dozen legends in all, so the set is scanned rather than a
      // denormalized key column being kept in sync with the catalogue.
      const legends = await meta.archiveLegends();
      const row = legends.find((candidate) => archiveLegendSlug(candidate) === input.slug);
      if (!row) {
        throw errors.NOT_FOUND({ message: "Legend not found" });
      }

      const [finishes, images] = await Promise.all([
        meta.finishesForLegend(row.cardId),
        imageIdsForCards(canonicalPrintings, [row.cardId]),
      ]);
      const ref = toMetaLegendRef(row, images);

      return {
        slug: ref.slug,
        legend: ref.legend,
        finishes: finishes.map((finish) => toMetaLegendFinish(finish)),
      };
    },
  ),

  counts: os.counts.handler(async ({ input, context }): Promise<MetaCountsResponse> => {
    const { meta } = context.repos;
    const [totalPlayers, decksWithMainDeck] = await Promise.all([
      meta.playerCountInScope(input),
      meta.deckCountInScope(input),
    ]);
    return { totalPlayers, decksWithMainDeck };
  }),
};
