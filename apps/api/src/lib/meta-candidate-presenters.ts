import type {
  MetaCandidateDetail,
  MetaCandidatePlayer,
  MetaCandidateQueueRow,
  MetaCandidateSource,
} from "@openrift/shared";

import type { CandidateMetaDeckCard } from "../db/index.js";
import type {
  CandidateMetaEventRow,
  CandidateMetaPlayerRow,
} from "../repositories/meta-candidates.js";
import type { MetaDeckCardDiff, MetaFieldDiff, MetaPlayerDiff } from "./meta-candidate-diff.js";
import { hasPlayerDiff, metaCandidateState } from "./meta-candidate-diff.js";

type CardNames = ReadonlyMap<string, string>;

type CardDiffResponse = NonNullable<MetaCandidatePlayer["diff"]>["cards"];

/**
 * The distinct card names in a candidate's list that matched no live card. This
 * is the accept gate for a list: a `deck_cards` row needs a real card id, and
 * the fix is a `card_name_aliases` row plus a rematch, not an edit here.
 *
 * A standings-only row has no list and so nothing to report — its own gate is
 * the legend, which resolves independently.
 */
export function unresolvedCardNames(cards: readonly CandidateMetaDeckCard[] | null): string[] {
  if (cards === null) {
    return [];
  }
  return [...new Set(cards.filter((card) => card.cardId === null).map((card) => card.name))];
}

/**
 * Swaps the `event` field diff's live-event ids for their names. The diff
 * compares events by id, because two events can share a name and a move
 * between them is still a move. A reviewer needs the name, so it goes on
 * here — an id with no name left stands for itself rather than disappearing.
 */
function withEventNames(
  fields: readonly MetaFieldDiff[],
  eventNames: ReadonlyMap<string, string>,
): MetaFieldDiff[] {
  function label(value: MetaFieldDiff["from"]): MetaFieldDiff["from"] {
    return typeof value === "string" ? (eventNames.get(value) ?? value) : value;
  }
  return fields.map((field) =>
    field.field === "event" ? { ...field, from: label(field.from), to: label(field.to) } : field,
  );
}

function toCardDiffResponse(diff: MetaDeckCardDiff, cardNames: CardNames): CardDiffResponse {
  return {
    added: diff.added.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    removed: diff.removed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    changed: diff.changed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
  };
}

/**
 * The standings row as the review screen reads it. `submittedByName` is null
 * for a provider's row, and for a submitter who never set a name or whose
 * account is gone.
 */
export function toMetaCandidatePlayer(
  player: CandidateMetaPlayerRow,
  options: {
    diff: MetaPlayerDiff | null;
    deckId: string | null;
    shareToken: string | null;
    cardNames: CardNames;
    eventNames: ReadonlyMap<string, string>;
    submittedByName?: string | null;
  },
): MetaCandidatePlayer {
  const { diff, cardNames, eventNames } = options;
  return {
    id: player.id,
    externalId: player.externalId,
    playerName: player.playerName,
    rank: player.rank,
    rankIsTier: player.rankIsTier,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    matchPoints: player.matchPoints,
    opponentMatchWinPct: player.opponentMatchWinPct,
    gameWinPct: player.gameWinPct,
    opponentGameWinPct: player.opponentGameWinPct,
    entryStatus: player.entryStatus,
    legendName: player.legendName,
    legendCardId: player.legendCardId,
    championName: player.championName,
    championCardId: player.championCardId,
    cards:
      player.cards === null
        ? null
        : player.cards.map((card) => ({
            name: card.name,
            zone: card.zone,
            quantity: card.quantity,
            cardId: card.cardId,
          })),
    listStatus: player.listStatus,
    unresolvedNames: unresolvedCardNames(player.cards),
    metaEventPlayerId: player.metaEventPlayerId,
    deckId: options.deckId,
    shareToken: options.shareToken,
    submittedByUserId: player.submittedByUserId,
    submittedByName: options.submittedByName ?? null,
    submissionNote: player.submissionNote,
    state: metaCandidateState(
      player.metaEventPlayerId !== null,
      diff !== null && hasPlayerDiff(diff),
    ),
    diff:
      diff === null
        ? null
        : {
            fields: withEventNames(diff.fields, eventNames),
            cards: toCardDiffResponse(diff.cards, cardNames),
          },
    checkedAt: player.checkedAt?.toISOString() ?? null,
  };
}

/**
 * One row of the review queue. The count options come from the caller because
 * they are aggregates over the event's standings, which the queue reads in one
 * batch rather than per row.
 */
export function toMetaCandidateQueueRow(
  event: CandidateMetaEventRow,
  options: {
    playerRowCount: number;
    unacceptedPlayerCount: number;
    unresolvedCardCount: number;
    linkedSourceCount: number;
    hasDiff: boolean;
    metaEventSlug: string | null;
  },
): MetaCandidateQueueRow {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerRowCount: options.playerRowCount,
    unacceptedPlayerCount: options.unacceptedPlayerCount,
    unresolvedCardCount: options.unresolvedCardCount,
    linkedSourceCount: options.linkedSourceCount,
    state: metaCandidateState(event.metaEventId !== null, options.hasDiff),
    checkedAt: event.checkedAt?.toISOString() ?? null,
    metaEventId: event.metaEventId,
    metaEventSlug: options.metaEventSlug,
  };
}

/**
 * The full candidate view. `sources` holds every candidate on the same live
 * event, this one included, so the review screen gets one column per source;
 * `submittedPlayers` are candidate rows attached to the live event directly —
 * user submissions, which belong to no source column.
 */
export function toMetaCandidateDetail(
  event: CandidateMetaEventRow,
  options: {
    diff: MetaFieldDiff[] | null;
    formatKnown: boolean;
    metaEventSlug: string | null;
    players: MetaCandidatePlayer[];
    sources: MetaCandidateSource[];
    submittedPlayers: MetaCandidatePlayer[];
  },
): MetaCandidateDetail {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    formatKnown: options.formatKnown,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    tier: event.tier,
    country: event.country,
    location: event.location,
    extraData: event.extraData ?? null,
    metaEventId: event.metaEventId,
    metaEventSlug: options.metaEventSlug,
    state: metaCandidateState(event.metaEventId !== null, (options.diff?.length ?? 0) > 0),
    diff: options.diff,
    checkedAt: event.checkedAt?.toISOString() ?? null,
    players: options.players,
    sources: options.sources,
    submittedPlayers: options.submittedPlayers,
  };
}

export function toMetaCandidateSource(
  event: CandidateMetaEventRow,
  players: MetaCandidatePlayer[],
): MetaCandidateSource {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    tier: event.tier,
    country: event.country,
    location: event.location,
    checkedAt: event.checkedAt?.toISOString() ?? null,
    players,
  };
}
